import chess
from fastapi.testclient import TestClient

from app.main import app


def test_health_and_settings_are_available_without_stockfish() -> None:
    with TestClient(app) as client:
        health = client.get("/health")
        profiles = client.get("/api/settings")

    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["opening_positions"] >= 3_800
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


def test_extension_event_is_forwarded_to_desktop() -> None:
    event = {
        "type": "position",
        "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "source": "manual",
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
