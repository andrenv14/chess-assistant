from pathlib import Path

import chess
import pytest

from app.openings import DEFAULT_OPENINGS_PATH, OpeningBook


def fen_after(*moves: str) -> str:
    board = chess.Board()
    for move in moves:
        board.push_uci(move)
    return board.fen()


def test_bundled_opening_catalog_is_present_and_substantial() -> None:
    book = OpeningBook(DEFAULT_OPENINGS_PATH)

    assert DEFAULT_OPENINGS_PATH.is_file()
    assert book.size >= 3_800


def test_identifies_sicilian_defense_from_position() -> None:
    opening = OpeningBook().lookup_fen(fen_after("e2e4", "c7c5"))

    assert opening is not None
    assert opening.eco == "B20"
    assert opening.name == "Sicilian Defense"
    assert opening.ply_count == 2


def test_fen_counters_do_not_change_opening_match() -> None:
    fen = fen_after("d2d4", "d7d5", "c2c4")
    fields = fen.split()
    fields[-2:] = ["47", "99"]

    opening = OpeningBook().lookup_fen(" ".join(fields))

    assert opening is not None
    assert opening.name == "Queen's Gambit"


def test_unknown_endgame_position_has_no_opening() -> None:
    opening = OpeningBook().lookup_fen("8/8/8/8/8/8/8/K6k w - - 0 1")

    assert opening is None


def test_rejects_dataset_with_unexpected_columns(tmp_path: Path) -> None:
    malformed = tmp_path / "openings.tsv"
    malformed.write_text("name\tepd\nBad\t8/8/8/8/8/8/8/K6k w - -\n", encoding="utf-8")

    book = OpeningBook(malformed)

    with pytest.raises(ValueError, match="unexpected opening dataset columns"):
        _ = book.size
