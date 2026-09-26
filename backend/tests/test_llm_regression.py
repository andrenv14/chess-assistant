import chess
import pytest

from app.explanations import ExplanationValidationError
from app.models import CandidateExplanation, PositionExplanation
from scripts.regression_llm import CASES, validate_humanized_output


def explanation_with(text: str) -> PositionExplanation:
    return PositionExplanation(
        position_support_ids=["P1"],
        position_summary=f"{text} A posição exige coordenação antes de qualquer ataque direto.",
        candidates=[
            CandidateExplanation(
                uci="e2e4",
                support_ids=["C1"],
                headline="Ocupar o centro com propósito",
                explanation="O avanço ganha espaço e prepara o desenvolvimento das peças menores.",
                plan_steps=["Desenvolva uma peça", "Proteja o rei"],
                opponent_reply_uci=None,
                opponent_response="O adversário pode contestar imediatamente o centro.",
                watch_for="Evite deixar o peão sem apoio.",
            )
        ],
    )


def test_paid_regression_matrix_has_unique_legal_fixed_positions() -> None:
    assert len(CASES) == 4
    assert len({case.id for case in CASES}) == len(CASES)
    assert all(chess.Board(case.fen).is_valid() for case in CASES)


def test_humanized_regression_accepts_natural_portuguese() -> None:
    validate_humanized_output(explanation_with("Com calma, a casa c3 pode ser usada,"))


@pytest.mark.parametrize("internal_name", ["plan_hint", "support_ids", "C12"])
def test_humanized_regression_rejects_internal_vocabulary(internal_name: str) -> None:
    with pytest.raises(ExplanationValidationError):
        validate_humanized_output(explanation_with(internal_name))
