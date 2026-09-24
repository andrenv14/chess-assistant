import chess
import pytest

from app.classification import (
    InvalidPositionTransitionError,
    classify_expected_points_loss,
    infer_played_move,
)

STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"


@pytest.mark.parametrize(
    ("loss", "expected"),
    [
        (0.0, "best"),
        (0.02, "excellent"),
        (0.05, "good"),
        (0.10, "inaccuracy"),
        (0.20, "mistake"),
        (0.21, "blunder"),
    ],
)
def test_expected_points_cutoffs(loss: float, expected: str) -> None:
    assert classify_expected_points_loss(loss).key == expected


def test_book_overrides_expected_points_loss() -> None:
    result = classify_expected_points_loss(0.5, is_book=True)

    assert result.key == "book"
    assert result.symbol == "📖"


def test_infers_the_unique_move_between_snapshots() -> None:
    after = chess.Board(STARTING_FEN)
    after.push_uci("e2e4")

    assert infer_played_move(STARTING_FEN, after.fen()).uci() == "e2e4"


def test_ignores_fen_move_counters_when_matching_snapshots() -> None:
    after = chess.Board(STARTING_FEN)
    after.push_uci("g1f3")
    fields = after.fen().split()
    fields[-2:] = ["99", "42"]

    assert infer_played_move(STARTING_FEN, " ".join(fields)).uci() == "g1f3"


def test_rejects_unrelated_snapshots() -> None:
    unrelated = "8/8/8/8/8/8/8/K6k w - - 0 1"

    with pytest.raises(InvalidPositionTransitionError):
        infer_played_move(STARTING_FEN, unrelated)
