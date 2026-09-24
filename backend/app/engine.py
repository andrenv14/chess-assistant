import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import chess
import chess.engine

from app.models import (
    AnalyzeRequest,
    AnalyzeResponse,
    EngineRole,
    EngineSettings,
    MoveAnalysis,
    ReplyAnalysis,
    default_profiles,
)


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
        self._lock = asyncio.Lock()

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

        async with self._lock:
            return await asyncio.to_thread(self._analyze_sync, request)

    async def close(self) -> None:
        async with self._lock:
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

        if request.include_replies and self.profiles[reply_role].enabled:
            for candidate in candidates:
                after_move = board.copy()
                move = chess.Move.from_uci(candidate.uci)
                if move not in after_move.legal_moves:
                    continue
                after_move.push(move)
                candidate.replies = self._replies(after_move, reply_role)

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

        return AnalyzeResponse(
            fen=request.fen,
            actor=request.actor,
            advisor_role=advisor_role,
            reply_role=reply_role,
            evaluation_cp=evaluation_cp,
            evaluation_mate=evaluation_mate,
            candidates=candidates,
        )

    def _replies(self, board: chess.Board, role: EngineRole) -> list[ReplyAnalysis]:
        profile = self.profiles[role]
        engine = self._get_engine(role)
        raw = engine.analyse(board, self._limit(profile), multipv=profile.multipv)
        infos = raw if isinstance(raw, list) else [raw]
        return [self._reply_analysis(board, info) for info in infos if info.get("pv")]

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
    def _pv_to_san(board: chess.Board, pv: list[chess.Move]) -> list[str]:
        replay = board.copy()
        san: list[str] = []
        for move in pv:
            if move not in replay.legal_moves:
                break
            san.append(replay.san(move))
            replay.push(move)
        return san
