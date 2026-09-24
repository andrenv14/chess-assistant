from dataclasses import dataclass

import chess

from app.models import MoveClassificationKey


class InvalidPositionTransitionError(ValueError):
    """Raised when two snapshots cannot be connected by exactly one legal move."""


@dataclass(frozen=True)
class Classification:
    key: MoveClassificationKey
    label: str
    symbol: str


CLASSIFICATIONS: dict[MoveClassificationKey, Classification] = {
    "book": Classification("book", "Livro", "📖"),
    "best": Classification("best", "Melhor", "★"),
    "excellent": Classification("excellent", "Excelente", "✓"),
    "good": Classification("good", "Bom", "○"),
    "inaccuracy": Classification("inaccuracy", "Imprecisão", "?!"),
    "mistake": Classification("mistake", "Erro", "?"),
    "blunder": Classification("blunder", "Erro grave", "??"),
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
