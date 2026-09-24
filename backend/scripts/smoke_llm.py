"""Paid smoke test for the real Stockfish -> evidence -> LLM pipeline.

The script intentionally reads credentials only from the environment and never
prints them. It performs one provider request for a fixed, reproducible position.
"""

import asyncio
import sys

import chess

from app.config import AppSettings
from app.engine import StockfishManager
from app.evidence import build_analysis_evidence
from app.explanations import ExplanationService, OpenAIExplanationProvider
from app.logging_config import configure_logging
from app.models import AnalyzeRequest, EngineSettings


def smoke_profile(*, multipv: int) -> EngineSettings:
    return EngineSettings(
        limit_strength=False,
        elo=3190,
        skill_level=20,
        move_time_ms=150,
        multipv=multipv,
        threads=1,
        hash_mb=32,
    )


def fixed_position() -> str:
    board = chess.Board()
    for move in ("e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"):
        board.push_uci(move)
    return board.fen()


async def run() -> None:
    settings = AppSettings()
    if not settings.stockfish_path or not settings.stockfish_path.is_file():
        raise SystemExit("Stockfish não encontrado; instale-o ou defina STOCKFISH_PATH.")
    if not settings.llm_api_key or not settings.llm_model:
        raise SystemExit("Defina LLM_API_KEY e LLM_MODEL somente no ambiente desta execução.")

    manager = StockfishManager(settings.stockfish_path)
    manager.update_profile("user", smoke_profile(multipv=3))
    manager.update_profile("opponent", smoke_profile(multipv=2))
    manager.update_profile("evaluator", smoke_profile(multipv=1))
    try:
        analysis = await manager.analyze(
            AnalyzeRequest(
                fen=fixed_position(),
                actor="user",
                include_evaluator=True,
                include_replies=True,
            )
        )
    finally:
        await manager.close()

    evidence = build_analysis_evidence(analysis)
    provider = OpenAIExplanationProvider(
        api_key=settings.llm_api_key,
        model=settings.llm_model,
        base_url=settings.llm_api_base_url,
        max_output_tokens=settings.llm_max_output_tokens,
    )
    explanation = await ExplanationService(provider).explain(evidence)
    print(explanation.model_dump_json(indent=2))


if __name__ == "__main__":
    configure_logging()
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        sys.exit(130)
