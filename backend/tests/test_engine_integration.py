import asyncio
import os
from pathlib import Path

import chess
import pytest

from app.engine import StockfishManager
from app.models import AnalyzeRequest, ClassifyMoveRequest, EngineSettings

STOCKFISH_BINARY = Path(os.environ.get("STOCKFISH_PATH", ""))

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        not STOCKFISH_BINARY.is_file(),
        reason="set STOCKFISH_PATH to run real-engine tests",
    ),
]


def fast_profile(*, multipv: int) -> EngineSettings:
    return EngineSettings(
        limit_strength=False,
        elo=3190,
        skill_level=20,
        move_time_ms=75,
        multipv=multipv,
        threads=1,
        hash_mb=32,
    )


def test_real_stockfish_analyzes_candidates_and_replies() -> None:
    async def scenario() -> None:
        manager = StockfishManager(STOCKFISH_BINARY)
        manager.update_profile("user", fast_profile(multipv=2))
        manager.update_profile("opponent", fast_profile(multipv=2))
        manager.update_profile("evaluator", fast_profile(multipv=1))
        try:
            result = await manager.analyze(
                AnalyzeRequest(fen=chess.STARTING_FEN, include_replies=True)
            )
        finally:
            await manager.close()

        assert len(result.candidates) == 2
        assert all(
            chess.Move.from_uci(move.uci) in chess.Board().legal_moves
            for move in result.candidates
        )
        assert all(move.replies for move in result.candidates)

    asyncio.run(scenario())


def test_real_stockfish_classifies_a_legal_transition() -> None:
    async def scenario():
        board = chess.Board()
        before_fen = board.fen()
        board.push_uci("e2e4")
        manager = StockfishManager(STOCKFISH_BINARY)
        manager.update_profile("evaluator", fast_profile(multipv=1))
        try:
            return await manager.classify_move(
                ClassifyMoveRequest(before_fen=before_fen, after_fen=board.fen()),
                is_book=True,
            )
        finally:
            await manager.close()

    result = asyncio.run(scenario())

    assert result.uci == "e2e4"
    assert result.classification == "book"
    assert chess.Move.from_uci(result.best_move_uci) in chess.Board().legal_moves
    assert 0 <= result.expected_points_loss <= 1
