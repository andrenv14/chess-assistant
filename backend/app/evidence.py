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

    facts = MoveFacts(
        is_capture=board.is_capture(move),
        captured_piece=chess.piece_name(captured_piece.piece_type) if captured_piece else None,
        gives_check=board.gives_check(move),
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


def _plan_hints(facts: MoveFacts) -> list[PlanHint]:
    hints: list[PlanHint] = []
    if facts.gives_check:
        hints.append("force_king_response")
    if facts.is_capture:
        hints.append("trade_or_win_material")
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
