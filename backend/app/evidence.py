import chess

from app.features import extract_position_features
from app.logging_config import get_logger, position_id
from app.models import (
    AnalysisEvidenceResponse,
    AnalyzeResponse,
    CandidateEvidence,
    MoveAnalysis,
    MoveFacts,
    PlanHint,
    PositionFeaturesResponse,
)

logger = get_logger(__name__)
CENTER_SQUARES = {chess.D4, chess.E4, chess.D5, chess.E5}
MINOR_HOME_SQUARES = {
    chess.B1,
    chess.C1,
    chess.F1,
    chess.G1,
    chess.B8,
    chess.C8,
    chess.F8,
    chess.G8,
}


def build_analysis_evidence(analysis: AnalyzeResponse) -> AnalysisEvidenceResponse:
    """Join Stockfish output with deterministic facts; Stockfish stays authoritative."""
    board = chess.Board(analysis.fen)
    position = extract_position_features(analysis.fen)
    candidates = [
        describe_candidate(board, rank, candidate, position)
        for rank, candidate in enumerate(analysis.candidates, start=1)
    ]
    logger.info(
        "analysis_evidence_built",
        extra={
            "event_data": {
                "position_id": position_id(analysis.fen),
                "candidate_count": len(candidates),
                "hint_count": sum(len(candidate.plan_hints) for candidate in candidates),
            }
        },
    )
    return AnalysisEvidenceResponse(
        analysis=analysis,
        position=position,
        candidates=candidates,
    )


def describe_candidate(
    board: chess.Board,
    rank: int,
    candidate: MoveAnalysis,
    before_features: PositionFeaturesResponse | None = None,
) -> CandidateEvidence:
    move = chess.Move.from_uci(candidate.uci)
    if move not in board.legal_moves:
        raise ValueError(f"Stockfish returned illegal candidate: {candidate.uci}")

    piece = board.piece_at(move.from_square)
    assert piece is not None
    mover = piece.color
    before_features = before_features or extract_position_features(board.fen())
    before_pawns = (
        before_features.white_pawns if mover == chess.WHITE else before_features.black_pawns
    )
    before_king = before_features.white_king if mover == chess.WHITE else before_features.black_king
    captured_piece = _captured_piece(board, move)

    before_attacks = _valuable_targets_attacked_by(board, move.from_square, not mover)
    before_pinned = set(_pinned_targets(board, not mover))

    facts = MoveFacts(
        is_capture=board.is_capture(move),
        captured_piece=chess.piece_name(captured_piece.piece_type) if captured_piece else None,
        gives_check=board.gives_check(move),
        gives_checkmate=False,
        fork_targets=[],
        newly_pinned_targets=[],
        newly_attacked_undefended_targets=[],
        is_castling=board.is_castling(move),
        promotion_piece=chess.piece_name(move.promotion) if move.promotion else None,
        develops_minor_piece=(
            piece.piece_type in (chess.KNIGHT, chess.BISHOP)
            and move.from_square in MINOR_HOME_SQUARES
        ),
        occupies_center=move.to_square in CENTER_SQUARES,
        moves_passed_pawn=chess.square_name(move.from_square) in before_pawns.passed_squares,
        creates_passed_pawn=False,
        improves_pawn_shield=False,
    )

    after = board.copy(stack=False)
    after.push(move)
    after_attacks = _valuable_targets_attacked_by(after, move.to_square, not mover)
    newly_attacked = after_attacks - before_attacks
    facts.gives_checkmate = after.is_checkmate()
    if len(after_attacks) >= 2 and newly_attacked:
        facts.fork_targets = sorted(chess.square_name(square) for square in after_attacks)
    facts.newly_pinned_targets = sorted(
        chess.square_name(square)
        for square in set(_pinned_targets(after, not mover)) - before_pinned
    )
    facts.newly_attacked_undefended_targets = sorted(
        chess.square_name(square)
        for square in newly_attacked
        if after.piece_type_at(square) != chess.KING
        and not after.attackers(not mover, square)
    )
    after_features = extract_position_features(after.fen())
    after_pawns = after_features.white_pawns if mover == chess.WHITE else after_features.black_pawns
    after_king = after_features.white_king if mover == chess.WHITE else after_features.black_king
    facts.creates_passed_pawn = bool(
        set(after_pawns.passed_squares) - set(before_pawns.passed_squares)
    )
    facts.improves_pawn_shield = after_king.pawn_shield_count > before_king.pawn_shield_count

    return CandidateEvidence(
        rank=rank,
        uci=candidate.uci,
        san=candidate.san,
        facts=facts,
        plan_hints=_plan_hints(facts),
        principal_variation_san=candidate.pv_san,
        opponent_replies=candidate.replies,
    )


def _captured_piece(board: chess.Board, move: chess.Move) -> chess.Piece | None:
    if board.is_en_passant(move):
        captured_square = move.to_square + (-8 if board.turn == chess.WHITE else 8)
        return board.piece_at(captured_square)
    return board.piece_at(move.to_square)


def _valuable_targets_attacked_by(
    board: chess.Board,
    attacker_square: chess.Square,
    target_color: chess.Color,
) -> set[chess.Square]:
    valuable_types = {
        chess.KNIGHT,
        chess.BISHOP,
        chess.ROOK,
        chess.QUEEN,
        chess.KING,
    }
    return {
        square
        for square in board.attacks(attacker_square)
        if (piece := board.piece_at(square)) is not None
        and piece.color == target_color
        and piece.piece_type in valuable_types
    }


def _pinned_targets(board: chess.Board, color: chess.Color) -> list[chess.Square]:
    return [
        square
        for square in chess.SquareSet(board.occupied_co[color])
        if board.piece_type_at(square) != chess.KING and board.is_pinned(color, square)
    ]


def _plan_hints(facts: MoveFacts) -> list[PlanHint]:
    hints: list[PlanHint] = []
    if facts.gives_checkmate:
        hints.append("deliver_checkmate")
    elif facts.gives_check:
        hints.append("force_check_response")
    if facts.fork_targets:
        hints.append("fork_pieces")
    if facts.newly_pinned_targets:
        hints.append("pin_piece")
    if facts.newly_attacked_undefended_targets:
        hints.append("attack_loose_piece")
    if facts.is_capture:
        hints.append("capture_or_exchange_material")
    if facts.is_castling:
        hints.append("secure_king")
    if facts.develops_minor_piece:
        hints.append("develop_and_coordinate")
    if facts.occupies_center:
        hints.append("contest_center")
    if facts.moves_passed_pawn:
        hints.append("advance_passed_pawn")
    if facts.creates_passed_pawn:
        hints.append("create_passed_pawn")
    if facts.promotion_piece:
        hints.append("promote_pawn")
    if facts.improves_pawn_shield and not facts.is_castling:
        hints.append("improve_king_safety")
    return hints
