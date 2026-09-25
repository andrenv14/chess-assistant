import sqlite3
from pathlib import Path

import chess

from app.evidence import build_analysis_evidence
from app.models import AnalyzeResponse, EngineSettings
from app.storage import LocalStore


def evidence_for(fen: str, *, evaluation_cp: int = 0):
    return build_analysis_evidence(
        AnalyzeResponse(
            fen=fen,
            actor="user",
            advisor_role="user",
            reply_role="opponent",
            evaluation_cp=evaluation_cp,
            evaluation_mate=None,
            candidates=[],
        )
    )


def new_store(path: Path, *, history_limit: int = 200) -> LocalStore:
    store = LocalStore(path, history_limit=history_limit)
    store.initialize()
    return store


def test_engine_profiles_survive_a_new_store_instance(tmp_path: Path) -> None:
    database = tmp_path / "assistant.sqlite3"
    first = new_store(database)
    profile = EngineSettings(elo=2050, skill_level=13, move_time_ms=350)

    first.save_profile("user", profile)
    second = new_store(database)

    assert second.load_profiles()["user"] == profile


def test_analysis_history_round_trips_and_reuses_a_position(tmp_path: Path) -> None:
    store = new_store(tmp_path / "assistant.sqlite3")
    original = evidence_for(chess.STARTING_FEN, evaluation_cp=20)
    updated = evidence_for(chess.STARTING_FEN, evaluation_cp=35)

    store.save_analysis(original)
    store.save_analysis(updated)
    summaries = store.list_history()

    assert len(summaries) == 1
    assert summaries[0].evaluation_cp == 35
    restored = store.get_history(summaries[0].id)
    assert restored is not None
    assert restored.analysis.fen == chess.STARTING_FEN
    assert restored.analysis.evaluation_cp == 35


def test_history_retention_and_clear_are_bounded(tmp_path: Path) -> None:
    store = new_store(tmp_path / "assistant.sqlite3", history_limit=2)
    board = chess.Board()
    positions = [board.fen()]
    for move in ("e2e4", "e7e5"):
        board.push_uci(move)
        positions.append(board.fen())

    for index, fen in enumerate(positions):
        store.save_analysis(evidence_for(fen, evaluation_cp=index))

    assert store.history_count() == 2
    assert [item.evaluation_cp for item in store.list_history()] == [2, 1]
    assert store.clear_history() == 2
    assert store.history_count() == 0


def test_invalid_stored_profile_is_ignored_without_losing_valid_rows(tmp_path: Path) -> None:
    database = tmp_path / "assistant.sqlite3"
    store = new_store(database)
    store.save_profile("opponent", EngineSettings(elo=1800))
    with sqlite3.connect(database) as connection:
        connection.execute(
            "INSERT INTO engine_profiles(role, settings_json, updated_at) VALUES (?, ?, ?)",
            ("user", "not-json", "2026-09-24T00:00:00+00:00"),
        )

    profiles = store.load_profiles()

    assert set(profiles) == {"opponent"}
