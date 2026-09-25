from dataclasses import dataclass
from typing import Literal

import chess

from app.models import MoveClassificationKey


class InvalidPositionTransitionError(ValueError):
    """Raised when two snapshots cannot be connected by exactly one legal move."""


@dataclass(frozen=True)
class Classification:
    key: MoveClassificationKey
    label: str
    symbol: str


ClassificationRule = Literal[
    "book",
    "brilliant_sacrifice",
    "unique_best_move",
    "missed_forcing_opportunity",
    "expected_points",
]


@dataclass(frozen=True)
class ClassificationDecision:
    classification: Classification
    rule: ClassificationRule


CLASSIFICATIONS: dict[MoveClassificationKey, Classification] = {
    "book": Classification("book", "Livro", "📖"),
    "brilliant": Classification("brilliant", "Brilhante", "!!"),
    "great": Classification("great", "Ótimo", "!"),
    "best": Classification("best", "Melhor", "★"),
    "excellent": Classification("excellent", "Excelente", "✓"),
    "good": Classification("good", "Bom", "👍"),
    "inaccuracy": Classification("inaccuracy", "Imprecisão", "?!"),
    "mistake": Classification("mistake", "Erro", "?"),
    "miss": Classification("miss", "Oportunidade perdida", "Ø"),
    "blunder": Classification("blunder", "Erro grave", "??"),
}

PIECE_VALUES = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
    chess.KING: 0,
}


def classify_expected_points_loss(loss: float, *, is_book: bool = False) -> Classification:
    """Classify a move using the public Classification V2 expected-points cutoffs.

    ``loss`` is the difference between the best move's expected score and the
    played move's expected score, both from the mover's perspective. Small
    floating-point noise is clamped so an engine-equivalent move remains Best.
    """
    if is_book:
        return CLASSIFICATIONS["book"]

    normalized = max(0.0, min(1.0, loss))
    if normalized <= 0.0005:
        return CLASSIFICATIONS["best"]
    if normalized <= 0.02:
        return CLASSIFICATIONS["excellent"]
    if normalized <= 0.05:
        return CLASSIFICATIONS["good"]
    if normalized <= 0.10:
        return CLASSIFICATIONS["inaccuracy"]
    if normalized <= 0.20:
        return CLASSIFICATIONS["mistake"]
    return CLASSIFICATIONS["blunder"]


def classify_move_quality(
    loss: float,
    *,
    is_book: bool,
    played_is_best: bool,
    expected_before: float,
    expected_after: float,
    second_best_expected: float | None,
    sacrifice_detected: bool,
    best_move_is_forcing: bool,
) -> ClassificationDecision:
    """Apply deterministic special rules before the expected-points bands.

    These rules follow the public semantics of the familiar review labels while
    deliberately avoiding rating-dependent or LLM-dependent judgment.
    """
    if is_book:
        return ClassificationDecision(CLASSIFICATIONS["book"], "book")

    normalized_loss = max(0.0, min(1.0, loss))
    alternative_is_not_trivially_winning = (
        second_best_expected is not None and second_best_expected < 0.90
    )
    if (
        sacrifice_detected
        and normalized_loss <= 0.02
        and expected_after >= 0.50
        and alternative_is_not_trivially_winning
    ):
        return ClassificationDecision(
            CLASSIFICATIONS["brilliant"],
            "brilliant_sacrifice",
        )

    second_best_loss = (
        max(0.0, expected_before - second_best_expected)
        if second_best_expected is not None
        else 0.0
    )
    if played_is_best and expected_after >= 0.45 and second_best_loss >= 0.10:
        return ClassificationDecision(CLASSIFICATIONS["great"], "unique_best_move")

    if (
        best_move_is_forcing
        and normalized_loss >= 0.10
        and expected_before >= 0.65
        and expected_after <= 0.55
    ):
        return ClassificationDecision(
            CLASSIFICATIONS["miss"],
            "missed_forcing_opportunity",
        )

    return ClassificationDecision(
        classify_expected_points_loss(normalized_loss),
        "expected_points",
    )


def is_forcing_move(board: chess.Board, move: chess.Move) -> bool:
    """Return whether a legal move is a capture, promotion or check."""
    if move not in board.legal_moves:
        return False
    if board.is_capture(move) or move.promotion is not None:
        return True
    after = board.copy(stack=False)
    after.push(move)
    return after.is_check()


def detects_piece_sacrifice(
    board: chess.Board,
    move: chess.Move,
    *,
    minimum_material_loss: int = 2,
) -> bool:
    """Detect an offered non-pawn piece that cannot be recovered immediately.

    This intentionally conservative static test is evidence, not an engine
    evaluation. Stockfish must still consider the move best or nearly best for
    the Brilliant rule to apply.
    """
    if move not in board.legal_moves:
        return False
    offered_piece = board.piece_at(move.from_square)
    if offered_piece is None or offered_piece.piece_type in {chess.PAWN, chess.KING}:
        return False

    mover = board.turn
    material_before = _material_balance(board, mover)
    after_move = board.copy(stack=False)
    after_move.push(move)

    for reply in list(after_move.legal_moves):
        captured_piece = after_move.piece_at(reply.to_square)
        if (
            reply.to_square != move.to_square
            or not after_move.is_capture(reply)
            or captured_piece is None
            or captured_piece.color != mover
        ):
            continue

        after_capture = after_move.copy(stack=False)
        after_capture.push(reply)
        best_recovery = _material_balance(after_capture, mover)
        for recapture in list(after_capture.legal_moves):
            if recapture.to_square != move.to_square or not after_capture.is_capture(recapture):
                continue
            recovered = after_capture.copy(stack=False)
            recovered.push(recapture)
            best_recovery = max(best_recovery, _material_balance(recovered, mover))

        if material_before - best_recovery >= minimum_material_loss:
            return True

    return False


def _material_balance(board: chess.Board, color: chess.Color) -> int:
    own = sum(
        len(board.pieces(piece_type, color)) * value
        for piece_type, value in PIECE_VALUES.items()
    )
    opponent = sum(
        len(board.pieces(piece_type, not color)) * value
        for piece_type, value in PIECE_VALUES.items()
    )
    return own - opponent


def position_key(board: chess.Board) -> tuple[str, str, str, str]:
    """Return the FEN fields that determine a legal chess position.

    Half-move and full-move counters are intentionally excluded because sites
    may omit or reconstruct them differently while showing the same board.
    """
    placement, turn, castling, en_passant, *_ = board.fen(en_passant="legal").split()
    return placement, turn, castling, en_passant


def infer_played_move(before_fen: str, after_fen: str) -> chess.Move:
    """Find the unique legal move that transforms ``before_fen`` into ``after_fen``."""
    before = chess.Board(before_fen)
    expected = position_key(chess.Board(after_fen))
    matches: list[chess.Move] = []

    for move in before.legal_moves:
        candidate = before.copy(stack=False)
        candidate.push(move)
        if position_key(candidate) == expected:
            matches.append(move)

    if len(matches) != 1:
        raise InvalidPositionTransitionError(
            f"expected one legal transition, found {len(matches)}"
        )
    return matches[0]
