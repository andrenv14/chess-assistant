from pathlib import Path

import chess
import chess.engine

from app.engine import StockfishManager
from app.models import ClassifyMoveRequest, EngineSettings


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


class FakeAnalysisEngine:
    def analyse(
        self,
        board: chess.Board,
        _limit: chess.engine.Limit,
        *,
        multipv: int,
    ) -> list[dict[str, object]]:
        assert multipv == 1
        if board.turn == chess.WHITE:
            return [
                {
                    "pv": [chess.Move.from_uci("e2e4")],
                    "score": chess.engine.PovScore(chess.engine.Cp(50), chess.WHITE),
                }
            ]
        return [
            {
                "pv": [chess.Move.from_uci("e7e5")],
                "score": chess.engine.PovScore(chess.engine.Cp(-50), chess.BLACK),
            }
        ]


def test_classification_keeps_the_movers_perspective(monkeypatch) -> None:
    before = chess.Board()
    after = before.copy()
    after.push_uci("e2e4")
    manager = StockfishManager(Path("unused-in-this-unit-test"))
    engine = FakeAnalysisEngine()
    monkeypatch.setattr(manager, "_get_engine", lambda _role: engine)

    result = manager._classify_move_sync(
        ClassifyMoveRequest(before_fen=before.fen(), after_fen=after.fen())
    )

    assert result.uci == "e2e4"
    assert result.best_move_uci == "e2e4"
    assert result.classification == "best"
    assert result.expected_points_loss == 0
