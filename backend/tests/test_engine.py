import asyncio
from pathlib import Path
from threading import Event

import chess
import chess.engine

from app.engine import StockfishManager
from app.models import (
    AnalyzeRequest,
    CandidateReplyRequest,
    ClassifyMoveRequest,
    EngineSettings,
)


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


class CountingAnalysisEngine(FakeEngine):
    def __init__(self) -> None:
        super().__init__()
        self.analysis_count = 0

    def analyse(
        self,
        _board: chess.Board,
        _limit: chess.engine.Limit,
        *,
        multipv: int,
    ) -> list[dict[str, object]]:
        self.analysis_count += 1
        assert multipv == 2
        return [
            {
                "pv": [chess.Move.from_uci("e2e4"), chess.Move.from_uci("e7e5")],
                "score": chess.engine.PovScore(chess.engine.Cp(35), chess.WHITE),
            },
            {
                "pv": [chess.Move.from_uci("d2d4"), chess.Move.from_uci("d7d5")],
                "score": chess.engine.PovScore(chess.engine.Cp(22), chess.WHITE),
            },
        ]


class CountingReplyEngine(FakeEngine):
    def __init__(self) -> None:
        super().__init__()
        self.analysis_count = 0

    def analyse(
        self,
        board: chess.Board,
        _limit: chess.engine.Limit,
        *,
        multipv: int,
    ) -> list[dict[str, object]]:
        self.analysis_count += 1
        assert multipv == 1
        uci = "c7c5" if board.piece_at(chess.E4) else "g8f6"
        return [
            {
                "pv": [chess.Move.from_uci(uci)],
                "score": chess.engine.PovScore(chess.engine.Cp(18), chess.WHITE),
            }
        ]


def test_analysis_uses_the_independent_reply_profile(monkeypatch) -> None:
    manager = StockfishManager(Path("unused-in-this-unit-test"))
    advisor = CountingAnalysisEngine()
    defender = CountingReplyEngine()
    manager.update_profile(
        "user",
        EngineSettings(move_time_ms=100, multipv=2),
    )
    manager.update_profile(
        "opponent",
        EngineSettings(move_time_ms=250, multipv=1, elo=1900),
    )
    monkeypatch.setattr(
        manager,
        "_get_engine",
        lambda role: advisor if role == "user" else defender,
    )

    result = manager._analyze_sync(
        AnalyzeRequest(
            fen=chess.STARTING_FEN,
            include_evaluator=False,
            include_replies=True,
        )
    )

    assert advisor.analysis_count == 1
    assert defender.analysis_count == 2
    assert [candidate.replies[0].san for candidate in result.candidates] == ["c5", "Nf6"]


def test_selected_candidate_reply_uses_the_other_role(monkeypatch) -> None:
    manager = StockfishManager(Path("unused-in-this-unit-test"))
    defender = CountingReplyEngine()
    monkeypatch.setattr(manager, "_get_engine", lambda role: defender)

    result = manager._analyze_candidate_reply_sync(
        CandidateReplyRequest(
            fen=chess.STARTING_FEN,
            actor="user",
            candidate_uci="e2e4",
        )
    )

    assert result.reply_role == "opponent"
    assert result.reply is not None
    assert result.reply.san == "c5"


def test_evaluator_and_advisor_do_not_share_a_global_queue(monkeypatch, tmp_path) -> None:
    async def scenario() -> list[bool]:
        executable = tmp_path / "stockfish.exe"
        executable.touch()
        manager = StockfishManager(executable)
        advisor_started = Event()
        evaluator_started = Event()
        overlapped: list[bool] = []

        def analyze_sync(_request):
            advisor_started.set()
            overlapped.append(evaluator_started.wait(timeout=0.5))
            return object()

        def classify_sync(_request, *, is_book=False):
            evaluator_started.set()
            overlapped.append(advisor_started.wait(timeout=0.5))
            return object()

        monkeypatch.setattr(manager, "_analyze_sync", analyze_sync)
        monkeypatch.setattr(manager, "_classify_move_sync", classify_sync)

        board = chess.Board()
        before = board.fen()
        board.push_uci("e2e4")
        await asyncio.gather(
            manager.analyze(
                AnalyzeRequest(
                    fen=before,
                    include_evaluator=False,
                    include_replies=False,
                )
            ),
            manager.classify_move(
                ClassifyMoveRequest(before_fen=before, after_fen=board.fen())
            ),
        )
        return overlapped

    assert all(asyncio.run(scenario()))


class FakeAnalysisEngine:
    def analyse(
        self,
        board: chess.Board,
        _limit: chess.engine.Limit,
        *,
        multipv: int,
    ) -> list[dict[str, object]]:
        if board.turn == chess.WHITE:
            assert multipv == 2
            return [
                {
                    "pv": [chess.Move.from_uci("e2e4")],
                    "score": chess.engine.PovScore(chess.engine.Cp(50), chess.WHITE),
                },
                {
                    "pv": [chess.Move.from_uci("d2d4")],
                    "score": chess.engine.PovScore(chess.engine.Cp(45), chess.WHITE),
                },
            ]
        assert multipv == 1
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
    assert result.evidence.played_is_engine_best is True
    assert result.evidence.second_best_move_uci == "d2d4"


class FakeBrilliantEngine:
    def analyse(
        self,
        board: chess.Board,
        _limit: chess.engine.Limit,
        *,
        multipv: int,
    ) -> list[dict[str, object]]:
        if board.turn == chess.WHITE:
            assert multipv == 2
            return [
                {
                    "pv": [chess.Move.from_uci("d3h7")],
                    "score": chess.engine.PovScore(chess.engine.Cp(50), chess.WHITE),
                },
                {
                    "pv": [chess.Move.from_uci("d3e2")],
                    "score": chess.engine.PovScore(chess.engine.Cp(20), chess.WHITE),
                },
            ]
        assert multipv == 1
        return [
            {
                "pv": [chess.Move.from_uci("g8h7")],
                "score": chess.engine.PovScore(chess.engine.Cp(-50), chess.BLACK),
            }
        ]


def test_classification_combines_engine_approval_with_sacrifice_evidence(monkeypatch) -> None:
    before = chess.Board("6k1/7p/8/8/8/3B4/8/3Q2K1 w - - 0 1")
    after = before.copy()
    after.push_uci("d3h7")
    manager = StockfishManager(Path("unused-in-this-unit-test"))
    monkeypatch.setattr(manager, "_get_engine", lambda _role: FakeBrilliantEngine())

    result = manager._classify_move_sync(
        ClassifyMoveRequest(before_fen=before.fen(), after_fen=after.fen())
    )

    assert result.classification == "brilliant"
    assert result.symbol == "!!"
    assert result.evidence.rule == "brilliant_sacrifice"
    assert result.evidence.sacrifice_detected is True
