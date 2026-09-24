from pathlib import Path

import chess
import chess.engine

from app.maia import MaiaConfiguration, MaiaManager
from app.models import HumanPredictionRequest


class FakeMaiaEngine:
    def __init__(self) -> None:
        self.options = {
            "SelfElo": object(),
            "OppoElo": object(),
            "MultiPV": object(),
            "Temperature": object(),
            "TopP": object(),
        }
        self.configured: dict[str, int | str] | None = None

    def configure(self, options: dict[str, int | str]) -> None:
        self.configured = options

    def analyse(
        self,
        _board: chess.Board,
        _limit: chess.engine.Limit,
        *,
        multipv: int,
    ) -> list[dict[str, object]]:
        assert multipv == 2
        return [
            {
                "pv": [chess.Move.from_uci("e2e4")],
                "wdl": chess.engine.PovWdl(chess.engine.Wdl(450, 350, 200), chess.WHITE),
            },
            {
                "pv": [chess.Move.from_uci("d2d4")],
                "wdl": chess.engine.PovWdl(chess.engine.Wdl(400, 375, 225), chess.WHITE),
            },
        ]


def test_configures_independent_player_elos() -> None:
    engine = FakeMaiaEngine()

    MaiaManager._configure(
        engine,  # type: ignore[arg-type]
        MaiaConfiguration(self_elo=1350, opponent_elo=1850, multipv=4),
    )

    assert engine.configured == {
        "SelfElo": 1350,
        "OppoElo": 1850,
        "MultiPV": 4,
        "Temperature": "0",
        "TopP": "1.0",
    }


def test_returns_ranked_human_candidates_without_stockfish_scores(monkeypatch) -> None:
    manager = MaiaManager(Path("unused-in-this-unit-test"))
    engine = FakeMaiaEngine()
    monkeypatch.setattr(manager, "_get_engine", lambda: engine)

    response = manager._predict_sync(
        HumanPredictionRequest(
            fen=chess.STARTING_FEN,
            self_elo=1500,
            opponent_elo=1700,
            multipv=2,
        )
    )

    assert [candidate.uci for candidate in response.candidates] == ["e2e4", "d2d4"]
    assert response.candidates[0].rank == 1
    assert response.candidates[0].win_probability == 0.45
    assert response.candidates[0].draw_probability == 0.35
    assert response.candidates[0].loss_probability == 0.2
