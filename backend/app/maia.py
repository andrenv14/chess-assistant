import asyncio
from dataclasses import dataclass
from pathlib import Path
from time import perf_counter
from typing import Any

import chess
import chess.engine

from app.logging_config import get_logger, position_id
from app.models import (
    HumanMovePrediction,
    HumanPredictionRequest,
    HumanPredictionResponse,
)

logger = get_logger(__name__)


class MaiaUnavailableError(RuntimeError):
    pass


@dataclass(frozen=True)
class MaiaConfiguration:
    self_elo: int
    opponent_elo: int
    multipv: int


class MaiaManager:
    """Optional UCI adapter for Maia-3's human-move model.

    Maia ranks plausible human choices. It does not replace Stockfish's
    objective evaluation and its compatibility centipawn score is ignored.
    """

    def __init__(self, executable_path: Path | None) -> None:
        self.executable_path = executable_path
        self._engine: chess.engine.SimpleEngine | None = None
        self._configured: MaiaConfiguration | None = None
        self._lock = asyncio.Lock()

    @property
    def available(self) -> bool:
        return self.executable_path is not None and self.executable_path.is_file()

    async def predict(self, request: HumanPredictionRequest) -> HumanPredictionResponse:
        if not self.available:
            raise MaiaUnavailableError(
                "Maia-3 is optional and not installed. Set MAIA3_PATH to maia3-5m."
            )

        async with self._lock:
            return await asyncio.to_thread(self._predict_sync, request)

    async def close(self) -> None:
        async with self._lock:
            engine, self._engine = self._engine, None
            self._configured = None
            if engine is not None:
                await asyncio.to_thread(engine.quit)

    def _get_engine(self) -> chess.engine.SimpleEngine:
        if self._engine is None:
            assert self.executable_path is not None
            self._engine = chess.engine.SimpleEngine.popen_uci(str(self.executable_path))
        return self._engine

    def _predict_sync(self, request: HumanPredictionRequest) -> HumanPredictionResponse:
        started = perf_counter()
        board = chess.Board(request.fen)
        engine = self._get_engine()
        configuration = MaiaConfiguration(
            self_elo=request.self_elo,
            opponent_elo=request.opponent_elo,
            multipv=request.multipv,
        )
        if configuration != self._configured:
            self._configure(engine, configuration)
            self._configured = configuration

        raw = engine.analyse(
            board,
            chess.engine.Limit(nodes=1),
            multipv=request.multipv,
        )
        infos = raw if isinstance(raw, list) else [raw]
        candidates = [
            self._candidate(board, rank, info)
            for rank, info in enumerate(infos, start=1)
            if info.get("pv")
        ]
        logger.info(
            "human_prediction_completed",
            extra={
                "event_data": {
                    "position_id": position_id(request.fen),
                    "self_elo": request.self_elo,
                    "opponent_elo": request.opponent_elo,
                    "candidate_count": len(candidates),
                    "duration_ms": round((perf_counter() - started) * 1000),
                }
            },
        )
        return HumanPredictionResponse(
            fen=request.fen,
            self_elo=request.self_elo,
            opponent_elo=request.opponent_elo,
            candidates=candidates,
        )

    @staticmethod
    def _configure(
        engine: chess.engine.SimpleEngine,
        configuration: MaiaConfiguration,
    ) -> None:
        requested: dict[str, int | str] = {
            "SelfElo": configuration.self_elo,
            "OppoElo": configuration.opponent_elo,
            "MultiPV": configuration.multipv,
            "Temperature": "0",
            "TopP": "1.0",
        }
        supported = {name: value for name, value in requested.items() if name in engine.options}
        engine.configure(supported)

    @staticmethod
    def _candidate(
        board: chess.Board,
        rank: int,
        info: dict[str, Any],
    ) -> HumanMovePrediction:
        move: chess.Move = info["pv"][0]
        probabilities = MaiaManager._probabilities(info.get("wdl"), board.turn)
        return HumanMovePrediction(
            rank=rank,
            uci=move.uci(),
            san=board.san(move),
            win_probability=probabilities[0],
            draw_probability=probabilities[1],
            loss_probability=probabilities[2],
        )

    @staticmethod
    def _probabilities(
        wdl: chess.engine.PovWdl | None,
        turn: chess.Color,
    ) -> tuple[float | None, float | None, float | None]:
        if wdl is None:
            return None, None, None
        relative = wdl.pov(turn)
        return (
            relative.wins / 1000,
            relative.draws / 1000,
            relative.losses / 1000,
        )
