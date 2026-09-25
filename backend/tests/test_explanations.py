import asyncio
import json
from types import SimpleNamespace

import chess
import pytest

from app.evidence import build_analysis_evidence
from app.explanations import (
    ExplanationPrompt,
    ExplanationProviderError,
    ExplanationService,
    ExplanationValidationError,
    OpenAIExplanationProvider,
    build_explanation_prompt,
)
from app.models import AnalyzeResponse, MoveAnalysis, PositionExplanation, ReplyAnalysis


def evidence_for(*moves: str):
    board = chess.Board()
    candidates = []
    for uci in moves:
        move = chess.Move.from_uci(uci)
        candidates.append(
            MoveAnalysis(
                uci=uci,
                san=board.san(move),
                score_cp=20,
                mate=None,
                pv_uci=[uci],
                pv_san=[board.san(move)],
                replies=[],
            )
        )
    analysis = AnalyzeResponse(
        fen=board.fen(),
        actor="user",
        advisor_role="user",
        reply_role="opponent",
        evaluation_cp=20,
        evaluation_mate=None,
        candidates=candidates,
    )
    return build_analysis_evidence(analysis)


def valid_payload(*moves: str) -> dict[str, object]:
    return {
        "position_support_ids": ["P1", "P2"],
        "position_summary": "A posição ainda está equilibrada e pede desenvolvimento.",
        "candidates": [
            {
                "uci": move,
                "support_ids": ["C1", "C2"],
                "headline": "Desenvolvimento natural",
                "explanation": "O lance ativa uma peça sem alterar a avaliação fornecida.",
                "plan_steps": ["Complete o desenvolvimento."],
                "opponent_reply_uci": None,
                "opponent_response": "Considere a resposta principal indicada pelo motor.",
                "watch_for": None,
            }
            for move in moves
        ],
    }


class FakeProvider:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload
        self.prompt: ExplanationPrompt | None = None

    async def generate(self, prompt: ExplanationPrompt) -> dict[str, object]:
        self.prompt = prompt
        return self.payload


def test_prompt_marks_stockfish_as_authority_and_serializes_evidence() -> None:
    evidence = evidence_for("g1f3", "e2e4")
    prompt = build_explanation_prompt(evidence)
    payload = json.loads(prompt.user)

    assert "Stockfish é a autoridade objetiva" in prompt.system
    assert "Nunca exponha nomes internos" in prompt.system
    assert "Use tom humano" in prompt.system
    assert "acentos e cedilha" in prompt.system
    assert "Não afirme qual foi o último lance" in prompt.system
    assert "Pressão geométrica" in prompt.system
    assert "derive planos apenas das variantes" in prompt.system
    assert payload["required_candidate_count"] == 2
    assert payload["required_candidate_order"] == ["g1f3", "e2e4"]
    assert payload["grounding"]["position"][0]["id"] == "P1"
    assert payload["grounding"]["candidates"][0]["supports"][0]["id"] == "C1"
    assert payload["grounding"]["candidates"][0]["supports"][0]["statement"].startswith(
        "Nf3 é a opção 1 do Stockfish"
    )
    assert payload["evidence"]["candidates"][0]["plan_hints"] == [
        "develop_and_coordinate"
    ]
    assert payload["evidence"]["position"]["white_pawns"]["pawn_island_count"] == 1
    assert payload["evidence"]["position"]["strategic"]["white_bishop_pair"] is True
    assert payload["evidence"]["position"]["endgame"]["active"] is False
    assert prompt.response_schema["title"] == "PositionExplanation"


def test_accepts_schema_valid_explanation_in_stockfish_order() -> None:
    evidence = evidence_for("g1f3", "e2e4")
    provider = FakeProvider(valid_payload("g1f3", "e2e4"))

    result = asyncio.run(ExplanationService(provider).explain(evidence))

    assert [candidate.uci for candidate in result.candidates] == ["g1f3", "e2e4"]
    assert provider.prompt is not None


def test_accepts_terminal_position_without_candidates() -> None:
    board = chess.Board("7k/6Q1/7K/8/8/8/8/8 b - - 0 1")
    analysis = AnalyzeResponse(
        fen=board.fen(),
        actor="opponent",
        advisor_role="opponent",
        reply_role="user",
        evaluation_cp=None,
        evaluation_mate=0,
        candidates=[],
    )
    evidence = build_analysis_evidence(analysis)
    provider = FakeProvider(
        {
            "position_support_ids": ["P1", "P3"],
            "position_summary": "A partida terminou em xeque-mate.",
            "candidates": [],
        }
    )

    result = asyncio.run(ExplanationService(provider).explain(evidence))

    assert result.candidates == []


def test_rejects_llm_reranking_stockfish_candidates() -> None:
    evidence = evidence_for("g1f3", "e2e4")
    provider = FakeProvider(valid_payload("e2e4", "g1f3"))

    with pytest.raises(ExplanationValidationError, match="Stockfish order"):
        asyncio.run(ExplanationService(provider).explain(evidence))


def test_rejects_missing_or_invented_candidate() -> None:
    evidence = evidence_for("g1f3", "e2e4")
    provider = FakeProvider(valid_payload("g1f3", "d2d4"))

    with pytest.raises(ExplanationValidationError):
        asyncio.run(ExplanationService(provider).explain(evidence))


def test_rejects_explanation_that_exposes_internal_plan_hint() -> None:
    evidence = evidence_for("g1f3")
    payload = valid_payload("g1f3")
    payload["candidates"][0]["explanation"] = "Use develop_and_coordinate."
    provider = FakeProvider(payload)

    with pytest.raises(ExplanationValidationError, match="internal"):
        asyncio.run(ExplanationService(provider).explain(evidence))


def test_rejects_invented_grounding_reference() -> None:
    evidence = evidence_for("g1f3")
    payload = valid_payload("g1f3")
    payload["candidates"][0]["support_ids"] = ["C99"]

    with pytest.raises(ExplanationValidationError, match="unsupported evidence"):
        asyncio.run(ExplanationService(FakeProvider(payload)).explain(evidence))


def test_rejects_opponent_reply_that_does_not_match_stockfish() -> None:
    evidence = evidence_for("g1f3")
    evidence.candidates[0].opponent_replies = [
        ReplyAnalysis(
            uci="d7d5",
            san="d5",
            score_cp=20,
            mate=None,
            pv_uci=["d7d5"],
            pv_san=["d5"],
        )
    ]
    payload = valid_payload("g1f3")
    payload["candidates"][0]["opponent_reply_uci"] = "g8f6"

    with pytest.raises(ExplanationValidationError, match="strongest Stockfish reply"):
        asyncio.run(ExplanationService(FakeProvider(payload)).explain(evidence))


def test_rejects_lower_rank_candidate_claiming_to_be_best() -> None:
    evidence = evidence_for("g1f3", "e2e4")
    payload = valid_payload("g1f3", "e2e4")
    payload["candidates"][1]["headline"] = "O melhor lance da posição"

    with pytest.raises(ExplanationValidationError, match="lower-ranked"):
        asyncio.run(ExplanationService(FakeProvider(payload)).explain(evidence))


def test_rejects_malformed_output_without_echoing_provider_content() -> None:
    evidence = evidence_for("g1f3")
    provider = FakeProvider({"position_summary": "private model output"})

    with pytest.raises(ExplanationValidationError) as caught:
        asyncio.run(ExplanationService(provider).explain(evidence))

    assert "private model output" not in str(caught.value)


class FakeResponsesApi:
    def __init__(self, parsed=None, error: Exception | None = None) -> None:
        self.parsed = parsed
        self.error = error
        self.kwargs = None

    def parse(self, **kwargs):
        self.kwargs = kwargs
        if self.error:
            raise self.error
        return SimpleNamespace(output_parsed=self.parsed)


def test_openai_transport_uses_responses_structured_output_without_storage() -> None:
    parsed = valid_payload("g1f3")
    responses = FakeResponsesApi(PositionExplanation.model_validate(parsed))
    client = SimpleNamespace(responses=responses)
    provider = OpenAIExplanationProvider(
        api_key="test-key",
        model="test-model",
        client=client,
    )
    prompt = build_explanation_prompt(evidence_for("g1f3"))

    result = asyncio.run(provider.generate(prompt))

    assert result["candidates"][0]["uci"] == "g1f3"
    assert responses.kwargs["model"] == "test-model"
    assert responses.kwargs["store"] is False
    assert responses.kwargs["max_output_tokens"] == 1800
    assert responses.kwargs["text_format"] is PositionExplanation


def test_openrouter_transport_requires_structured_output_capable_provider() -> None:
    parsed = valid_payload("g1f3")
    responses = FakeResponsesApi(PositionExplanation.model_validate(parsed))
    provider = OpenAIExplanationProvider(
        api_key="test-key",
        model="google/gemini-3.8-flash",
        base_url="https://openrouter.ai/api/v1",
        client=SimpleNamespace(responses=responses),
    )

    asyncio.run(provider.generate(build_explanation_prompt(evidence_for("g1f3"))))

    assert responses.kwargs["extra_body"] == {
        "provider": {"require_parameters": True}
    }


def test_openai_transport_normalizes_provider_failure() -> None:
    responses = FakeResponsesApi(error=RuntimeError("secret request details"))
    provider = OpenAIExplanationProvider(
        api_key="test-key",
        model="test-model",
        client=SimpleNamespace(responses=responses),
    )
    prompt = build_explanation_prompt(evidence_for("g1f3"))

    with pytest.raises(ExplanationProviderError, match="OpenAI request failed") as caught:
        asyncio.run(provider.generate(prompt))

    assert "secret request details" not in str(caught.value)


def test_openai_transport_rejects_missing_structured_output() -> None:
    provider = OpenAIExplanationProvider(
        api_key="test-key",
        model="test-model",
        client=SimpleNamespace(responses=FakeResponsesApi()),
    )
    prompt = build_explanation_prompt(evidence_for("g1f3"))

    with pytest.raises(ExplanationProviderError, match="incomplete"):
        asyncio.run(provider.generate(prompt))
