from app.engine import StockfishManager
from app.models import EngineSettings


class FakeEngine:
    def __init__(self) -> None:
        self.options = {
            "Threads": object(),
            "Hash": object(),
            "UCI_LimitStrength": object(),
            "UCI_Elo": object(),
            "Skill Level": object(),
        }
        self.configured: dict[str, int | bool] | None = None

    def configure(self, options: dict[str, int | bool]) -> None:
        self.configured = options


def test_limited_profile_maps_to_stockfish_uci_options() -> None:
    engine = FakeEngine()
    profile = EngineSettings(
        elo=2050,
        skill_level=13,
        threads=2,
        hash_mb=256,
        move_time_ms=300,
    )

    StockfishManager._configure(engine, profile)  # type: ignore[arg-type]

    assert engine.configured == {
        "Threads": 2,
        "Hash": 256,
        "UCI_LimitStrength": True,
        "UCI_Elo": 2050,
        "Skill Level": 13,
    }


def test_full_strength_profile_does_not_send_uci_elo() -> None:
    engine = FakeEngine()
    profile = EngineSettings(limit_strength=False, move_time_ms=300)

    StockfishManager._configure(engine, profile)  # type: ignore[arg-type]

    assert engine.configured is not None
    assert engine.configured["UCI_LimitStrength"] is False
    assert "UCI_Elo" not in engine.configured
