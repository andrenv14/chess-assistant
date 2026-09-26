import asyncio
from contextlib import AsyncExitStack
from dataclasses import dataclass
from pathlib import Path
from time import perf_counter
from typing import Any

import chess
import chess.engine

from app.classification import (
    classify_move_quality,
    detects_piece_sacrifice,
    infer_played_move,
    is_forcing_move,
)
from app.logging_config import get_logger, position_id
from app.models import (
    AnalyzeRequest,
    AnalyzeResponse,
    CandidateReplyRequest,
    CandidateReplyResponse,
    ClassifyMoveRequest,
    EngineRole,
    EngineSettings,
    MoveAnalysis,
    MoveClassificationEvidence,
    MoveClassificationResponse,
    PositionEvaluationResponse,
    ReplyAnalysis,
    default_profiles,
)

logger = get_logger(__name__)


class EngineUnavailableError(RuntimeError):
    pass


@dataclass
class EngineSlot:
    engine: chess.engine.SimpleEngine
    configured: EngineSettings | None = None


class StockfishManager:
    def __init__(self, stockfish_path: Path | None) -> None:
        self.stockfish_path = stockfish_path
        self.profiles = default_profiles()
        self._slots: dict[EngineRole, EngineSlot] = {}
        # Each role owns a distinct native Stockfish process. A single global
        # lock made the evaluator's post-move classification block the advisor
        # even though those processes can safely work in parallel.
        self._role_locks: dict[EngineRole, asyncio.Lock] = {
            role: asyncio.Lock() for role in ("user", "opponent", "evaluator")
        }

    @property
    def available(self) -> bool:
        return self.stockfish_path is not None and self.stockfish_path.is_file()

    def update_profile(self, role: EngineRole, profile: EngineSettings) -> EngineSettings:
        self.profiles[role] = profile
        return profile

    async def analyze(self, request: AnalyzeRequest) -> AnalyzeResponse:
        if not self.available:
            raise EngineUnavailableError(
                "Stockfish not found. Set STOCKFISH_PATH in backend/.env."
            )

        roles: set[EngineRole] = {request.actor}
        if request.include_replies:
            roles.add("opponent" if request.actor == "user" else "user")
        if request.include_evaluator and self.profiles["evaluator"].enabled:
            roles.add("evaluator")
        async with AsyncExitStack() as stack:
            for role in sorted(roles):
                await stack.enter_async_context(self._role_locks[role])
            return await asyncio.to_thread(self._analyze_sync, request)

    async def analyze_candidate_reply(
        self,
        request: CandidateReplyRequest,
    ) -> CandidateReplyResponse:
        if not self.available:
            raise EngineUnavailableError(
                "Stockfish not found. Set STOCKFISH_PATH in backend/.env."
            )

        reply_role: EngineRole = "opponent" if request.actor == "user" else "user"
        if not self.profiles[reply_role].enabled:
            raise EngineUnavailableError(f"engine profile '{reply_role}' is disabled")
        async with self._role_locks[reply_role]:
            return await asyncio.to_thread(self._analyze_candidate_reply_sync, request)

    async def classify_move(
        self,
        request: ClassifyMoveRequest,
        *,
        is_book: bool = False,
    ) -> MoveClassificationResponse:
        if not self.available:
            raise EngineUnavailableError(
                "Stockfish not found. Set STOCKFISH_PATH in backend/.env."
            )

        async with self._role_locks["evaluator"]:
            return await asyncio.to_thread(self._classify_move_sync, request, is_book=is_book)

    async def evaluate(self, fen: str) -> PositionEvaluationResponse:
        if not self.available:
            raise EngineUnavailableError(
                "Stockfish not found. Set STOCKFISH_PATH in backend/.env."
            )
        if not self.profiles["evaluator"].enabled:
            raise EngineUnavailableError("engine profile 'evaluator' is disabled")
        async with self._role_locks["evaluator"]:
            return await asyncio.to_thread(self._evaluate_sync, fen)

    async def close(self) -> None:
        async with AsyncExitStack() as stack:
            for role in ("evaluator", "opponent", "user"):
                await stack.enter_async_context(self._role_locks[role])
            slots = list(self._slots.values())
            self._slots.clear()
            await asyncio.gather(
                *(asyncio.to_thread(slot.engine.quit) for slot in slots),
                return_exceptions=True,
            )

    def _get_engine(self, role: EngineRole) -> chess.engine.SimpleEngine:
        profile = self.profiles[role]
        slot = self._slots.get(role)
        if slot is None:
            assert self.stockfish_path is not None
            slot = EngineSlot(chess.engine.SimpleEngine.popen_uci(str(self.stockfish_path)))
            self._slots[role] = slot

        if slot.configured != profile:
            self._configure(slot.engine, profile)
            slot.configured = profile.model_copy(deep=True)
        return slot.engine

    @staticmethod
    def _configure(engine: chess.engine.SimpleEngine, profile: EngineSettings) -> None:
        options: dict[str, int | bool] = {
            "Threads": profile.threads,
            "Hash": profile.hash_mb,
        }
        if "UCI_LimitStrength" in engine.options:
            options["UCI_LimitStrength"] = profile.limit_strength
        if profile.limit_strength and "UCI_Elo" in engine.options:
            options["UCI_Elo"] = profile.elo
        if "Skill Level" in engine.options:
            options["Skill Level"] = profile.skill_level
        engine.configure(options)

    @staticmethod
    def _limit(profile: EngineSettings) -> chess.engine.Limit:
        return chess.engine.Limit(
            time=profile.move_time_ms / 1000 if profile.move_time_ms is not None else None,
            depth=profile.depth,
        )

    def _analyze_sync(self, request: AnalyzeRequest) -> AnalyzeResponse:
        started = perf_counter()
        board = chess.Board(request.fen)
        advisor_role: EngineRole = request.actor
        reply_role: EngineRole = "opponent" if request.actor == "user" else "user"
        advisor_profile = self.profiles[advisor_role]
        if not advisor_profile.enabled:
            raise EngineUnavailableError(f"engine profile '{advisor_role}' is disabled")

        advisor = self._get_engine(advisor_role)
        raw = advisor.analyse(
            board,
            self._limit(advisor_profile),
            multipv=advisor_profile.multipv,
        )
        infos = raw if isinstance(raw, list) else [raw]
        candidates = [self._move_analysis(board, info) for info in infos if info.get("pv")]

        if request.include_replies:
            reply_profile = self.profiles[reply_role]
            if not reply_profile.enabled:
                raise EngineUnavailableError(f"engine profile '{reply_role}' is disabled")
            reply_engine = self._get_engine(reply_role)
            for candidate in candidates:
                reply = self._calculate_reply(
                    board,
                    candidate.uci,
                    reply_engine,
                    reply_profile,
                )
                candidate.replies = [reply] if reply is not None else []

        evaluation_cp: int | None = candidates[0].score_cp if candidates else None
        evaluation_mate: int | None = candidates[0].mate if candidates else None
        evaluator_profile = self.profiles["evaluator"]
        if request.include_evaluator and evaluator_profile.enabled:
            evaluator = self._get_engine("evaluator")
            evaluator_info = evaluator.analyse(board, self._limit(evaluator_profile), multipv=1)
            evaluator_infos = (
                evaluator_info if isinstance(evaluator_info, list) else [evaluator_info]
            )
            if evaluator_infos:
                evaluation_cp, evaluation_mate = self._score(evaluator_infos[0]["score"])

        response = AnalyzeResponse(
            fen=request.fen,
            actor=request.actor,
            advisor_role=advisor_role,
            reply_role=reply_role,
            evaluation_cp=evaluation_cp,
            evaluation_mate=evaluation_mate,
            candidates=candidates,
        )
        logger.info(
            "analysis_completed",
            extra={
                "event_data": {
                    "position_id": position_id(request.fen),
                    "actor": request.actor,
                    "candidate_count": len(candidates),
                    "duration_ms": round((perf_counter() - started) * 1000),
                }
            },
        )
        return response

    def _analyze_candidate_reply_sync(
        self,
        request: CandidateReplyRequest,
    ) -> CandidateReplyResponse:
        started = perf_counter()
        board = chess.Board(request.fen)
        reply_role: EngineRole = "opponent" if request.actor == "user" else "user"
        reply = self._calculate_reply(
            board,
            request.candidate_uci,
            self._get_engine(reply_role),
            self.profiles[reply_role],
        )
        logger.info(
            "candidate_reply_completed",
            extra={
                "event_data": {
                    "position_id": position_id(request.fen),
                    "candidate": request.candidate_uci,
                    "reply_role": reply_role,
                    "duration_ms": round((perf_counter() - started) * 1000),
                }
            },
        )
        return CandidateReplyResponse(
            fen=request.fen,
            actor=request.actor,
            candidate_uci=request.candidate_uci,
            reply_role=reply_role,
            reply=reply,
        )

    def _classify_move_sync(
        self,
        request: ClassifyMoveRequest,
        *,
        is_book: bool = False,
    ) -> MoveClassificationResponse:
        started = perf_counter()
        before = chess.Board(request.before_fen)
        move = infer_played_move(request.before_fen, request.after_fen)
        mover = before.turn
        san = before.san(move)

        evaluator_profile = self.profiles["evaluator"]
        if not evaluator_profile.enabled:
            raise EngineUnavailableError("engine profile 'evaluator' is disabled")
        evaluator = self._get_engine("evaluator")
        limit = self._limit(evaluator_profile)

        before_raw = evaluator.analyse(before, limit, multipv=min(2, before.legal_moves.count()))
        before_infos = before_raw if isinstance(before_raw, list) else [before_raw]
        before_info = before_infos[0]
        best_move: chess.Move = before_info["pv"][0]
        best_move_san = before.san(best_move)
        before_cp, before_mate = self._score(before_info["score"])
        expected_before = self._expected_points(before_info["score"], mover, before.ply())

        second_best_move: chess.Move | None = None
        second_best_expected: float | None = None
        if len(before_infos) > 1 and before_infos[1].get("pv"):
            second_best_move = before_infos[1]["pv"][0]
            second_best_expected = self._expected_points(
                before_infos[1]["score"],
                mover,
                before.ply(),
            )

        after = chess.Board(request.after_fen)
        after_info = self._first_info(evaluator.analyse(after, limit, multipv=1))
        after_cp, after_mate = self._score(after_info["score"])
        expected_after = self._expected_points(after_info["score"], mover, after.ply())
        expected_loss = max(0.0, expected_before - expected_after)
        sacrifice_detected = detects_piece_sacrifice(before, move)
        best_move_is_forcing = is_forcing_move(before, best_move)
        decision = classify_move_quality(
            expected_loss,
            is_book=is_book,
            played_is_best=move == best_move,
            expected_before=expected_before,
            expected_after=expected_after,
            second_best_expected=second_best_expected,
            sacrifice_detected=sacrifice_detected,
            best_move_is_forcing=best_move_is_forcing,
        )
        classification = decision.classification
        second_best_loss = (
            max(0.0, expected_before - second_best_expected)
            if second_best_expected is not None
            else None
        )

        response = MoveClassificationResponse(
            uci=move.uci(),
            san=san,
            best_move_uci=best_move.uci(),
            best_move_san=best_move_san,
            classification=classification.key,
            label=classification.label,
            symbol=classification.symbol,
            expected_points_before=expected_before,
            expected_points_after=expected_after,
            expected_points_loss=expected_loss,
            evaluation_before_cp=before_cp,
            evaluation_before_mate=before_mate,
            evaluation_after_cp=after_cp,
            evaluation_after_mate=after_mate,
            evidence=MoveClassificationEvidence(
                rule=decision.rule,
                played_is_engine_best=move == best_move,
                sacrifice_detected=sacrifice_detected,
                best_move_is_forcing=best_move_is_forcing,
                second_best_move_uci=(
                    second_best_move.uci() if second_best_move is not None else None
                ),
                second_best_move_san=(
                    before.san(second_best_move) if second_best_move is not None else None
                ),
                second_best_expected_points=second_best_expected,
                second_best_expected_points_loss=second_best_loss,
            ),
        )
        logger.info(
            "move_classified",
            extra={
                "event_data": {
                    "position_id": position_id(request.before_fen),
                    "move": move.uci(),
                    "classification": classification.key,
                    "expected_points_loss": round(expected_loss, 4),
                    "duration_ms": round((perf_counter() - started) * 1000),
                }
            },
        )
        return response

    def _evaluate_sync(self, fen: str) -> PositionEvaluationResponse:
        started = perf_counter()
        board = chess.Board(fen)
        profile = self.profiles["evaluator"]
        raw = self._get_engine("evaluator").analyse(
            board,
            self._limit(profile),
            multipv=1,
        )
        info = self._first_info(raw)
        evaluation_cp, evaluation_mate = self._score(info["score"])
        logger.info(
            "objective_evaluation_completed",
            extra={
                "event_data": {
                    "position_id": position_id(fen),
                    "duration_ms": round((perf_counter() - started) * 1000),
                }
            },
        )
        return PositionEvaluationResponse(
            fen=fen,
            evaluation_cp=evaluation_cp,
            evaluation_mate=evaluation_mate,
        )

    def _calculate_reply(
        self,
        board: chess.Board,
        candidate_uci: str,
        engine: chess.engine.SimpleEngine,
        profile: EngineSettings,
    ) -> ReplyAnalysis | None:
        after_candidate = board.copy(stack=False)
        first_move = chess.Move.from_uci(candidate_uci)
        if first_move not in after_candidate.legal_moves:
            raise ValueError(f"candidate is not legal in the supplied position: {candidate_uci}")
        after_candidate.push(first_move)
        if after_candidate.is_game_over():
            return None
        raw = engine.analyse(after_candidate, self._limit(profile), multipv=1)
        info = self._first_info(raw)
        return self._reply_analysis(after_candidate, info) if info.get("pv") else None

    def _move_analysis(self, board: chess.Board, info: dict[str, Any]) -> MoveAnalysis:
        reply = self._reply_analysis(board, info)
        return MoveAnalysis(**reply.model_dump(), replies=[])

    def _reply_analysis(self, board: chess.Board, info: dict[str, Any]) -> ReplyAnalysis:
        pv: list[chess.Move] = info["pv"]
        score_cp, mate = self._score(info["score"])
        return ReplyAnalysis(
            uci=pv[0].uci(),
            san=board.san(pv[0]),
            score_cp=score_cp,
            mate=mate,
            pv_uci=[move.uci() for move in pv],
            pv_san=self._pv_to_san(board, pv),
        )

    @staticmethod
    def _score(score: chess.engine.PovScore) -> tuple[int | None, int | None]:
        white_score = score.white()
        return white_score.score(), white_score.mate()

    @staticmethod
    def _expected_points(score: chess.engine.PovScore, color: chess.Color, ply: int) -> float:
        return score.pov(color).wdl(model="sf16.1", ply=ply).expectation()

    @staticmethod
    def _first_info(
        raw: dict[str, Any] | list[dict[str, Any]],
    ) -> dict[str, Any]:
        return raw[0] if isinstance(raw, list) else raw

    @staticmethod
    def _pv_to_san(board: chess.Board, pv: list[chess.Move]) -> list[str]:
        replay = board.copy()
        san: list[str] = []
        for move in pv:
            if move not in replay.legal_moves:
                break
            san.append(replay.san(move))
            replay.push(move)
        return san
