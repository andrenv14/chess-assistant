import argparse
import asyncio
import json

import chess

from app.config import settings
from app.engine import StockfishManager
from app.models import ClassifyMoveRequest, EngineSettings


async def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect one native Stockfish move label.")
    parser.add_argument("fen")
    parser.add_argument("san")
    parser.add_argument("--depth", type=int, default=16)
    args = parser.parse_args()
    if settings.stockfish_path is None:
        raise SystemExit("STOCKFISH_PATH is not configured")

    board = chess.Board(args.fen)
    before = board.fen()
    board.push_san(args.san)
    manager = StockfishManager(settings.stockfish_path)
    manager.update_profile(
        "evaluator",
        EngineSettings(
            limit_strength=False,
            elo=3190,
            skill_level=20,
            move_time_ms=None,
            depth=args.depth,
            multipv=1,
            threads=1,
            hash_mb=64,
        ),
    )
    try:
        result = await manager.classify_move(
            ClassifyMoveRequest(before_fen=before, after_fen=board.fen())
        )
        print(json.dumps(result.model_dump(mode="json"), indent=2, ensure_ascii=True))
    finally:
        await manager.close()


if __name__ == "__main__":
    asyncio.run(main())
