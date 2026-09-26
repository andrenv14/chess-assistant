"""Measure user-visible engine latency with the real configured Stockfish.

The script prints machine-readable JSON and never reads or emits the LLM key.
It is intentionally outside the unit suite because results depend on the host.
"""

from __future__ import annotations

import asyncio
import json
import sys
from collections.abc import Awaitable
from importlib import import_module
from pathlib import Path
from time import perf_counter
from typing import TypeVar

import chess

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

settings = import_module("app.config").settings
StockfishManager = import_module("app.engine").StockfishManager
models = import_module("app.models")
AnalyzeRequest = models.AnalyzeRequest
CandidateReplyRequest = models.CandidateReplyRequest
ClassifyMoveRequest = models.ClassifyMoveRequest

T = TypeVar("T")


async def timed(awaitable: Awaitable[T]) -> tuple[T, float]:
    started = perf_counter()
    result = await awaitable
    return result, (perf_counter() - started) * 1000


async def benchmark() -> dict[str, float | int]:
    manager = StockfishManager(settings.stockfish_path)
    if not manager.available:
        raise SystemExit("Stockfish is unavailable; install it or set STOCKFISH_PATH")

    initial = AnalyzeRequest(
        fen=chess.STARTING_FEN,
        actor="user",
        include_evaluator=False,
        include_replies=False,
    )
    board = chess.Board()
    before_fen = board.fen()
    board.push_uci("e2e4")
    after_e4 = board.fen()

    try:
        cold_result, cold_ms = await timed(manager.analyze(initial))
        _, warm_ms = await timed(manager.analyze(initial))
        _, reply_ms = await timed(
            manager.analyze_candidate_reply(
                CandidateReplyRequest(
                    fen=initial.fen,
                    actor="user",
                    candidate_uci=cold_result.candidates[0].uci,
                )
            )
        )

        concurrent_started = perf_counter()
        candidates_task = asyncio.create_task(
            manager.analyze(
                AnalyzeRequest(
                    fen=after_e4,
                    actor="opponent",
                    include_evaluator=False,
                    include_replies=False,
                )
            )
        )
        classification_task = asyncio.create_task(
            manager.classify_move(
                ClassifyMoveRequest(before_fen=before_fen, after_fen=after_e4),
                is_book=True,
            )
        )
        await candidates_task
        candidates_during_classification_ms = (perf_counter() - concurrent_started) * 1000
        await classification_task
        classification_total_ms = (perf_counter() - concurrent_started) * 1000
    finally:
        await manager.close()

    return {
        "candidate_count": len(cold_result.candidates),
        "cold_candidates_ms": round(cold_ms),
        "warm_candidates_ms": round(warm_ms),
        "selected_reply_ms": round(reply_ms),
        "candidates_during_classification_ms": round(candidates_during_classification_ms),
        "classification_total_ms": round(classification_total_ms),
    }


if __name__ == "__main__":
    print(json.dumps(asyncio.run(benchmark()), indent=2, sort_keys=True))
