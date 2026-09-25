import chess
import pytest

from app.classification import (
    InvalidPositionTransitionError,
    classify_expected_points_loss,
    classify_move_quality,
    detects_piece_sacrifice,
    infer_played_move,
    is_forcing_move,
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


def test_brilliant_requires_a_sound_nontrivial_piece_sacrifice() -> None:
    result = classify_move_quality(
        0.01,
        is_book=False,
        played_is_best=False,
        expected_before=0.76,
        expected_after=0.75,
        second_best_expected=0.72,
        sacrifice_detected=True,
        best_move_is_forcing=True,
    )

    assert result.classification.key == "brilliant"
    assert result.rule == "brilliant_sacrifice"


def test_brilliant_is_rejected_when_an_alternative_is_already_trivially_winning() -> None:
    result = classify_move_quality(
        0.01,
        is_book=False,
        played_is_best=True,
        expected_before=0.98,
        expected_after=0.97,
        second_best_expected=0.95,
        sacrifice_detected=True,
        best_move_is_forcing=True,
    )

    assert result.classification.key == "excellent"
    assert result.rule == "expected_points"


def test_great_marks_the_unique_best_move_that_preserves_the_result() -> None:
    result = classify_move_quality(
        0.0,
        is_book=False,
        played_is_best=True,
        expected_before=0.62,
        expected_after=0.62,
        second_best_expected=0.49,
        sacrifice_detected=False,
        best_move_is_forcing=False,
    )

    assert result.classification.key == "great"
    assert result.rule == "unique_best_move"


def test_miss_marks_an_unconverted_forcing_winning_opportunity() -> None:
    result = classify_move_quality(
        0.24,
        is_book=False,
        played_is_best=False,
        expected_before=0.74,
        expected_after=0.50,
        second_best_expected=0.48,
        sacrifice_detected=False,
        best_move_is_forcing=True,
    )

    assert result.classification.key == "miss"
    assert result.rule == "missed_forcing_opportunity"


def test_book_has_priority_over_every_special_rule() -> None:
    result = classify_move_quality(
        0.4,
        is_book=True,
        played_is_best=False,
        expected_before=0.9,
        expected_after=0.5,
        second_best_expected=0.2,
        sacrifice_detected=True,
        best_move_is_forcing=True,
    )

    assert result.classification.key == "book"
    assert result.rule == "book"


def test_detects_an_offered_bishop_that_cannot_be_recovered_immediately() -> None:
    board = chess.Board("6k1/7p/8/8/8/3B4/8/3Q2K1 w - - 0 1")

    assert detects_piece_sacrifice(board, chess.Move.from_uci("d3h7")) is True


def test_equal_exchange_is_not_a_piece_sacrifice() -> None:
    board = chess.Board("rk6/8/8/8/8/8/8/R5K1 w - - 0 1")

    assert detects_piece_sacrifice(board, chess.Move.from_uci("a1a8")) is False


def test_forcing_move_requires_capture_promotion_or_check() -> None:
    board = chess.Board()

    assert is_forcing_move(board, chess.Move.from_uci("e2e4")) is False
    assert is_forcing_move(
        chess.Board("6k1/8/8/8/8/8/4Q3/6K1 w - - 0 1"),
        chess.Move.from_uci("e2e8"),
    ) is True


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
