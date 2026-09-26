"""Paid, fixed regression matrix for the real Stockfish -> LLM pipeline.

Credentials are read only from the environment. The script emits compact
acceptance metadata, never the API key, provider payload, prompt or full prose.
Use ``--dry-run`` to validate all chess fixtures without spending provider
credit.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from dataclasses import dataclass
from time import perf_counter

from app.config import AppSettings
from app.engine import StockfishManager
from app.evidence import build_analysis_evidence
from app.explanations import (
    ExplanationProviderError,
    ExplanationService,
    ExplanationValidationError,
    OpenAIExplanationProvider,
)
from app.logging_config import configure_logging
from app.models import (
    Actor,
    AnalysisEvidenceResponse,
    AnalyzeRequest,
    EngineSettings,
    PositionExplanation,
)


@dataclass(frozen=True)
class RegressionCase:
    id: str
    fen: str
    actor: Actor
    expected_phase: str
    expected_repertoire: str | None = None
    require_mate_in_one: bool = False


CASES = (
    RegressionCase(
        id="forced-mate",
        fen="r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
        actor="user",
        expected_phase="opening",
        require_mate_in_one=True,
    ),
    RegressionCase(
        id="london-strategy",
        fen="rnbq1rk1/pp3ppp/3bpn2/2pp4/3P4/4PNB1/PPPN1PPP/R2QKB1R w KQ - 0 7",
        actor="user",
        expected_phase="middlegame",
        expected_repertoire="london",
    ),
    RegressionCase(
        id="rook-endgame",
        fen="8/5pk1/6p1/3r4/7P/5KP1/3R4/8 w - - 0 35",
        actor="user",
        expected_phase="endgame",
    ),
    RegressionCase(
        id="sicilian-black",
        fen="rnbqkbnr/pp1p1ppp/4p3/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq - 0 4",
        actor="opponent",
        expected_phase="opening",
        expected_repertoire="sicilian_e6",
    ),
)


def regression_profile(*, multipv: int) -> EngineSettings:
    return EngineSettings(
        limit_strength=False,
        elo=3190,
        skill_level=20,
        move_time_ms=200,
        multipv=multipv,
        threads=1,
        hash_mb=64,
    )


def validate_chess_fixture(case: RegressionCase, evidence: AnalysisEvidenceResponse) -> None:
    if evidence.position.phase != case.expected_phase:
        raise RuntimeError(
            f"{case.id}: expected phase {case.expected_phase}, got {evidence.position.phase}"
        )
    repertoire_id = evidence.repertoire.id if evidence.repertoire else None
    if repertoire_id != case.expected_repertoire:
        raise RuntimeError(
            f"{case.id}: expected repertoire {case.expected_repertoire}, got {repertoire_id}"
        )
    if not evidence.candidates:
        raise RuntimeError(f"{case.id}: Stockfish returned no candidate")
    if case.require_mate_in_one and not any(
        candidate.facts.gives_checkmate for candidate in evidence.candidates
    ):
        raise RuntimeError(f"{case.id}: expected a verified mate in one")
    if case.expected_phase == "endgame" and not evidence.position.endgame.active:
        raise RuntimeError(f"{case.id}: endgame classifier is not active")


def validate_humanized_output(explanation: PositionExplanation) -> None:
    payload = explanation.model_dump()
    human_fields = [payload["position_summary"]]
    for candidate in payload["candidates"]:
        human_fields.extend(
            [
                candidate["headline"],
                candidate["explanation"],
                *candidate["plan_steps"],
                candidate["opponent_response"],
                candidate.get("watch_for") or "",
            ]
        )
    text = " ".join(human_fields)
    if len(payload["position_summary"].strip()) < 20:
        raise ExplanationValidationError("position prose is too short for the regression")
    if any(len(candidate["explanation"].strip()) < 20 for candidate in payload["candidates"]):
        raise ExplanationValidationError("candidate prose is too short for the regression")
    if re.search(r"\b(?:support_ids?|plan_hints?|position_summary)\b", text, re.I) or re.search(
        r"\b[PC]\d+\b", text
    ):
        raise ExplanationValidationError("human prose exposed an internal grounding identifier")
    if re.search(r"\b[a-z]+_[a-z_]+\b", text):
        raise ExplanationValidationError("human prose exposed a snake_case implementation name")


async def run(selected_ids: set[str], *, dry_run: bool) -> None:
    settings = AppSettings()
    if not settings.stockfish_path or not settings.stockfish_path.is_file():
        raise SystemExit("Stockfish não encontrado; instale-o ou defina STOCKFISH_PATH.")
    if not dry_run and (not settings.llm_api_key or not settings.llm_model):
        raise SystemExit("Defina LLM_API_KEY e LLM_MODEL somente no ambiente desta execução.")

    selected = [case for case in CASES if not selected_ids or case.id in selected_ids]
    unknown = selected_ids - {case.id for case in CASES}
    if unknown:
        raise SystemExit(f"Casos desconhecidos: {', '.join(sorted(unknown))}")

    manager = StockfishManager(settings.stockfish_path)
    for role in ("user", "opponent"):
        manager.update_profile(role, regression_profile(multipv=3))
    manager.update_profile("evaluator", regression_profile(multipv=1))

    provider = None
    if not dry_run:
        assert settings.llm_api_key is not None and settings.llm_model is not None
        provider = OpenAIExplanationProvider(
            api_key=settings.llm_api_key,
            model=settings.llm_model,
            base_url=settings.llm_api_base_url,
            max_output_tokens=settings.llm_max_output_tokens,
        )

    try:
        for case in selected:
            started = perf_counter()
            analysis = await manager.analyze(
                AnalyzeRequest(
                    fen=case.fen,
                    actor=case.actor,
                    include_evaluator=False,
                    include_replies=True,
                )
            )
            evidence = build_analysis_evidence(analysis)
            validate_chess_fixture(case, evidence)
            provider_validated = False
            if provider is not None:
                explanation = await ExplanationService(provider).explain(evidence)
                validate_humanized_output(explanation)
                provider_validated = True
            print(
                json.dumps(
                    {
                        "case": case.id,
                        "phase": evidence.position.phase,
                        "repertoire": evidence.repertoire.id if evidence.repertoire else None,
                        "candidates": len(evidence.candidates),
                        "top_move": evidence.candidates[0].san,
                        "provider_validated": provider_validated,
                        "duration_ms": round((perf_counter() - started) * 1000),
                    },
                    ensure_ascii=False,
                )
            )
    finally:
        await manager.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--case",
        action="append",
        default=[],
        choices=[case.id for case in CASES],
        help="Executa somente o caso informado; pode ser repetido.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Valida Stockfish, fatos e fixtures sem chamar o provedor pago.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    configure_logging()
    args = parse_args()
    try:
        asyncio.run(run(set(args.case), dry_run=args.dry_run))
    except KeyboardInterrupt:
        sys.exit(130)
    except (ExplanationProviderError, ExplanationValidationError) as exc:
        raise SystemExit(f"Regressão recusada com segurança: {exc}") from None
