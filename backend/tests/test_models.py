import pytest
from pydantic import ValidationError

from app.models import AnalyzeRequest, EngineSettings, default_profiles


def test_default_profiles_are_independent() -> None:
    profiles = default_profiles()

    assert profiles["user"].elo == 1600
    assert profiles["opponent"].elo == 1800
    assert profiles["evaluator"].limit_strength is False


def test_strength_can_change_during_session() -> None:
    profile = EngineSettings(elo=2100, skill_level=14, move_time_ms=250)

    assert profile.elo == 2100
    assert profile.skill_level == 14


def test_rejects_invalid_fen() -> None:
    with pytest.raises(ValidationError):
        AnalyzeRequest(fen="not-a-fen")


def test_accepts_initial_position() -> None:
    request = AnalyzeRequest(
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    )

    assert request.actor == "user"
