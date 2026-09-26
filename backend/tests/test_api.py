from pathlib import Path

import chess
import pytest
from fastapi.testclient import TestClient

from app.evidence import build_analysis_evidence
from app.explanations import ExplanationProviderError
from app.main import app, maia_manager, manager
from app.models import AnalyzeResponse, MoveAnalysis, PositionExplanation, default_profiles
from app.storage import LocalStore, StorageError


@pytest.fixture(autouse=True)
def isolated_local_store(tmp_path: Path, monkeypatch):
    local_store = LocalStore(tmp_path / "assistant.sqlite3")
    monkeypatch.setattr("app.main.store", local_store)
    manager.profiles = default_profiles()
    yield local_store
    manager.profiles = default_profiles()


def test_health_and_settings_are_available_without_stockfish() -> None:
    with TestClient(app) as client:
        health = client.get("/health")
        profiles = client.get("/api/settings")

    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["service"] == "chess-assistant-backend"
    assert health.json()["opening_positions"] >= 3_800
    assert health.json()["storage_available"] is True
    assert health.json()["history_count"] == 0
    assert profiles.status_code == 200
    assert set(profiles.json()["profiles"]) == {"user", "opponent", "evaluator"}


def test_profile_can_be_changed_at_runtime() -> None:
    payload = {
        "enabled": True,
        "limit_strength": True,
        "elo": 2050,
        "skill_level": 13,
        "move_time_ms": 350,
        "depth": None,
        "multipv": 3,
        "threads": 1,
        "hash_mb": 128,
    }

    with TestClient(app) as client:
        response = client.put("/api/settings/user", json=payload)

    assert response.status_code == 200
    assert response.json()["elo"] == 2050


def test_profile_is_restored_after_backend_restart() -> None:
    payload = {
        "enabled": True,
        "limit_strength": True,
        "elo": 2050,
        "skill_level": 13,
        "move_time_ms": 350,
        "depth": None,
        "multipv": 3,
        "threads": 1,
        "hash_mb": 128,
    }

    with TestClient(app) as client:
        assert client.put("/api/settings/user", json=payload).status_code == 200

    manager.profiles = default_profiles()
    with TestClient(app) as restarted_client:
        restored = restarted_client.get("/api/settings")

    assert restored.json()["profiles"]["user"]["elo"] == 2050


def test_storage_failure_does_not_disable_runtime_profiles(monkeypatch) -> None:
    def fail_initialization() -> None:
        raise StorageError("test storage failure")

    monkeypatch.setattr("app.main.store.initialize", fail_initialization)
    payload = {
        "enabled": True,
        "limit_strength": True,
        "elo": 1900,
        "skill_level": 11,
        "move_time_ms": 300,
        "depth": None,
        "multipv": 2,
        "threads": 1,
        "hash_mb": 64,
    }

    with TestClient(app) as client:
        health = client.get("/health")
        updated = client.put("/api/settings/user", json=payload)
        history = client.get("/api/history")

    assert health.json()["storage_available"] is False
    assert updated.status_code == 200
    assert updated.json()["elo"] == 1900
    assert history.status_code == 503


def test_extension_event_is_forwarded_to_desktop() -> None:
    event = {
        "type": "position",
        "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "source": "chesscom-live",
        "at": "2026-09-24T12:00:00Z",
    }

    with TestClient(app) as client, client.websocket_connect("/ws/desktop") as desktop:
        desktop.send_text("ready")
        with client.websocket_connect("/ws/extension") as extension:
            extension.send_json(event)
            assert desktop.receive_json() == event
            assert extension.receive_json() == {
                "type": "ack",
                "at": "2026-09-24T12:00:00Z",
            }


def test_opening_endpoint_identifies_position() -> None:
    board = chess.Board()
    board.push_uci("e2e4")
    board.push_uci("c7c5")

    with TestClient(app) as client:
        response = client.get("/api/opening", params={"fen": board.fen()})

    assert response.status_code == 200
    assert response.json()["name"] == "Sicilian Defense"


def test_opening_endpoint_rejects_invalid_fen() -> None:
    with TestClient(app) as client:
        response = client.get("/api/opening", params={"fen": "not-a-fen"})

    assert response.status_code == 422


def test_human_prediction_is_explicitly_optional(monkeypatch) -> None:
    monkeypatch.setattr(maia_manager, "executable_path", None)
    payload = {
        "fen": chess.STARTING_FEN,
        "self_elo": 1500,
        "opponent_elo": 1600,
        "multipv": 3,
    }

    with TestClient(app) as client:
        response = client.post("/api/human-prediction", json=payload)

    assert response.status_code == 503
    assert "optional and not installed" in response.json()["detail"]


def test_position_features_do_not_require_an_engine() -> None:
    with TestClient(app) as client:
        response = client.post("/api/features", json={"fen": chess.STARTING_FEN})

    assert response.status_code == 200
    payload = response.json()
    assert payload["phase"] == "opening"
    assert payload["material"]["balance_cp"] == 0
    assert payload["white_pawns"]["pawn_island_count"] == 1
    assert payload["strategic"]["files"]["open_files"] == []
    assert payload["strategic"]["white_bishop_pair"] is True
    assert payload["endgame"]["active"] is False
    assert payload["tactics"]["legal_move_count"] == 20


def test_explanation_requires_configured_api(monkeypatch) -> None:
    monkeypatch.setattr("app.main.explanation_service", None)

    with TestClient(app) as client:
        response = client.post(
            "/api/explain",
            json={"fen": chess.STARTING_FEN, "actor": "user"},
        )

    assert response.status_code == 503
    assert "LLM_API_KEY" in response.json()["detail"]


def _analysis_for_starting_position() -> AnalyzeResponse:
    return AnalyzeResponse(
        fen=chess.STARTING_FEN,
        actor="user",
        advisor_role="user",
        reply_role="opponent",
        evaluation_cp=20,
        evaluation_mate=None,
        candidates=[
            MoveAnalysis(
                uci="g1f3",
                san="Nf3",
                score_cp=20,
                mate=None,
                pv_uci=["g1f3"],
                pv_san=["Nf3"],
                replies=[],
            )
        ],
    )


def test_analysis_history_can_be_listed_restored_and_cleared(monkeypatch) -> None:
    async def analyze(_request):
        return _analysis_for_starting_position()

    monkeypatch.setattr(manager, "analyze", analyze)
    with TestClient(app) as client:
        analyzed = client.post(
            "/api/evidence",
            json={"fen": chess.STARTING_FEN, "actor": "user"},
        )
        history = client.get("/api/history")
        history_id = history.json()[0]["id"]
        restored = client.get(f"/api/history/{history_id}")
        cleared = client.delete("/api/history")
        missing = client.get(f"/api/history/{history_id}")

    assert analyzed.status_code == 200
    assert history.status_code == 200
    assert history.json()[0]["candidate_san"] == ["Nf3"]
    assert restored.status_code == 200
    assert restored.json()["analysis"]["fen"] == chess.STARTING_FEN
    assert cleared.json() == {"deleted": 1}
    assert missing.status_code == 404


class StubExplanationService:
    async def explain(self, evidence):
        assert evidence.candidates[0].uci == "g1f3"
        return PositionExplanation(
            position_support_ids=["P1"],
            position_summary="Uma posição inicial equilibrada.",
            candidates=[
                {
                    "uci": "g1f3",
                    "support_ids": ["C1"],
                    "headline": "Desenvolva o cavalo",
                    "explanation": "O lance desenvolve uma peça.",
                    "plan_steps": ["Prepare o roque."],
                    "opponent_reply_uci": None,
                    "opponent_response": "O adversário também pode desenvolver.",
                    "watch_for": None,
                }
            ],
        )


def test_explanation_returns_matching_evidence_and_prose(monkeypatch) -> None:
    async def analyze(_request):
        return _analysis_for_starting_position()

    monkeypatch.setattr(manager, "analyze", analyze)
    monkeypatch.setattr("app.main.explanation_service", StubExplanationService())

    with TestClient(app) as client:
        response = client.post(
            "/api/explain",
            json={"fen": chess.STARTING_FEN, "actor": "user"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["evidence"]["analysis"]["candidates"][0]["uci"] == "g1f3"
    assert payload["explanation"]["candidates"][0]["uci"] == "g1f3"


def test_existing_evidence_explanation_does_not_run_stockfish_again(monkeypatch) -> None:
    async def fail_if_analyzed(_request):
        raise AssertionError("Stockfish analysis must not be repeated")

    evidence = build_analysis_evidence(_analysis_for_starting_position())
    monkeypatch.setattr(manager, "analyze", fail_if_analyzed)
    monkeypatch.setattr("app.main.explanation_service", StubExplanationService())

    with TestClient(app) as client:
        response = client.post(
            "/api/explain/evidence",
            json=evidence.model_dump(mode="json"),
        )

    assert response.status_code == 200
    assert response.json()["evidence"]["analysis"]["fen"] == chess.STARTING_FEN


class FailingExplanationService:
    async def explain(self, _evidence):
        raise ExplanationProviderError("private provider details")


def test_explanation_provider_failure_is_redacted(monkeypatch) -> None:
    async def analyze(_request):
        return _analysis_for_starting_position()

    monkeypatch.setattr(manager, "analyze", analyze)
    monkeypatch.setattr("app.main.explanation_service", FailingExplanationService())

    with TestClient(app) as client:
        response = client.post(
            "/api/explain",
            json={"fen": chess.STARTING_FEN, "actor": "user"},
        )

    assert response.status_code == 502
    assert response.json()["detail"] == "LLM explanation was unavailable or invalid"
    assert "private provider details" not in response.text
