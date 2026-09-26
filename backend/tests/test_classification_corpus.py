import asyncio
import json
import os
from pathlib import Path
from typing import Any

import chess
import pytest

from app.engine import StockfishManager
from app.models import ClassifyMoveRequest, EngineSettings

STOCKFISH_BINARY = Path(os.environ.get("STOCKFISH_PATH", ""))
CORPUS_PATH = Path(__file__).parent / "fixtures" / "classification_corpus.json"

with CORPUS_PATH.open(encoding="utf-8") as corpus_file:
    CORPUS: dict[str, Any] = json.load(corpus_file)

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        not STOCKFISH_BINARY.is_file(),
        reason="set STOCKFISH_PATH to run the native classification corpus",
    ),
]


def evaluator_profile() -> EngineSettings:
    engine = CORPUS["engine"]
    return EngineSettings(
        limit_strength=False,
        elo=3190,
        skill_level=20,
        move_time_ms=None,
        depth=engine["depth"],
        multipv=1,
        threads=engine["threads"],
        hash_mb=engine["hash_mb"],
    )


def replay_case(case: dict[str, Any]) -> tuple[str, str]:
    board = chess.Board(case["before_fen"]) if "before_fen" in case else chess.Board()
    for san in case.get("moves_before", []):
        board.push_san(san)
    before_fen = board.fen()
    board.push_san(case["played_san"])
    return before_fen, board.fen()


@pytest.mark.parametrize("case", CORPUS["cases"], ids=lambda case: case["id"])
def test_native_stockfish_classification_corpus(case: dict[str, Any]) -> None:
    async def scenario():
        before_fen, after_fen = replay_case(case)
        manager = StockfishManager(STOCKFISH_BINARY)
        manager.update_profile("evaluator", evaluator_profile())
        try:
            return await manager.classify_move(
                ClassifyMoveRequest(before_fen=before_fen, after_fen=after_fen)
            )
        finally:
            await manager.close()

    result = asyncio.run(scenario())
    expected = case["expected"]

    assert result.san == case["played_san"]
    assert result.classification == expected["classification"]
    assert result.evidence.rule == expected["rule"]
    assert result.evidence.sacrifice_detected is expected["sacrifice_detected"]
    assert result.evidence.played_is_engine_best is expected["played_is_engine_best"]
    assert result.expected_points_after >= expected.get("expected_points_after_min", 0)
    assert result.expected_points_after <= expected.get("expected_points_after_max", 1)

    second_best_min = expected.get("second_best_expected_points_min")
    if second_best_min is not None:
        assert result.evidence.second_best_expected_points is not None
        assert result.evidence.second_best_expected_points >= second_best_min
