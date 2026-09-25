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
PIECE_VALUES = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
}
ORTHOGONAL_DIRECTIONS = ((1, 0), (-1, 0), (0, 1), (0, -1))
DIAGONAL_DIRECTIONS = ((1, 1), (1, -1), (-1, 1), (-1, -1))


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
    before_relative_pinned = _relative_pinned_targets(board, not mover)
    before_sliding_attacks = _sliding_attack_pairs(board, mover)

    facts = MoveFacts(
        is_capture=board.is_capture(move),
        captured_piece=chess.piece_name(captured_piece.piece_type) if captured_piece else None,
        gives_check=board.gives_check(move),
        gives_checkmate=False,
        fork_targets=[],
        newly_pinned_targets=[],
        newly_relative_pinned_targets=[],
        discovered_attack_targets=[],
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
        occupies_outpost=False,
        creates_outpost=False,
        rook_to_open_file=False,
        rook_to_seventh_rank=False,
        pawn_break=False,
        space_gain=0,
        mobility_gain=0,
        centralizes_king=False,
        removed_defender_targets=[],
        interfered_attack_targets=[],
        connects_rooks=False,
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
    facts.newly_relative_pinned_targets = sorted(
        chess.square_name(square)
        for square in _relative_pinned_targets(after, not mover) - before_relative_pinned
    )
    newly_opened_attacks = _sliding_attack_pairs(after, mover) - before_sliding_attacks
    if not board.is_castling(move):
        facts.discovered_attack_targets = sorted(
            {
                chess.square_name(target_square)
                for attacker_square, target_square in newly_opened_attacks
                if attacker_square != move.to_square
            }
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
    before_strategic = before_features.strategic
    after_strategic = after_features.strategic
    before_outposts = set(
        before_strategic.white_potential_outposts
        if mover == chess.WHITE
        else before_strategic.black_potential_outposts
    )
    after_outposts = set(
        after_strategic.white_potential_outposts
        if mover == chess.WHITE
        else after_strategic.black_potential_outposts
    )
    occupied_outposts = set(
        after_strategic.white_occupied_outposts
        if mover == chess.WHITE
        else after_strategic.black_occupied_outposts
    )
    facts.occupies_outpost = chess.square_name(move.to_square) in occupied_outposts
    facts.creates_outpost = bool(after_outposts - before_outposts)
    mover_open_rooks = set(
        after_strategic.white_rooks_on_open_files
        if mover == chess.WHITE
        else after_strategic.black_rooks_on_open_files
    )
    mover_semi_open_rooks = set(
        after_strategic.white_rooks_on_semi_open_files
        if mover == chess.WHITE
        else after_strategic.black_rooks_on_semi_open_files
    )
    mover_seventh_rooks = set(
        after_strategic.white_seventh_rank_rooks
        if mover == chess.WHITE
        else after_strategic.black_seventh_rank_rooks
    )
    destination = chess.square_name(move.to_square)
    before_open_rooks = set(
        before_strategic.white_rooks_on_open_files
        if mover == chess.WHITE
        else before_strategic.black_rooks_on_open_files
    )
    before_semi_open_rooks = set(
        before_strategic.white_rooks_on_semi_open_files
        if mover == chess.WHITE
        else before_strategic.black_rooks_on_semi_open_files
    )
    facts.rook_to_open_file = (
        piece.piece_type == chess.ROOK
        and destination in (mover_open_rooks | mover_semi_open_rooks)
        and chess.square_name(move.from_square) not in (before_open_rooks | before_semi_open_rooks)
    )
    facts.rook_to_seventh_rank = (
        piece.piece_type == chess.ROOK and destination in mover_seventh_rooks
    )
    facts.pawn_break = piece.piece_type == chess.PAWN and _is_pawn_break(board, after, move, mover)
    before_space = (
        before_strategic.white_space_count
        if mover == chess.WHITE
        else before_strategic.black_space_count
    )
    after_space = (
        after_strategic.white_space_count
        if mover == chess.WHITE
        else after_strategic.black_space_count
    )
    facts.space_gain = max(0, after_space - before_space)
    facts.mobility_gain = _mobility_gain(board, after, move, piece)
    facts.centralizes_king = (
        piece.piece_type == chess.KING
        and before_features.endgame.active
        and _center_distance(move.to_square) < _center_distance(move.from_square)
    )
    facts.removed_defender_targets = _removed_defender_targets(board, after, move, mover)
    facts.interfered_attack_targets = _interfered_attack_targets(board, after, move, mover)
    facts.connects_rooks = not _rooks_connected(board, mover) and _rooks_connected(after, mover)

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


def _relative_pinned_targets(
    board: chess.Board,
    target_color: chess.Color,
) -> set[chess.Square]:
    """Return front pieces shielding a more valuable non-king piece on a ray."""
    targets: set[chess.Square] = set()
    attacker_color = not target_color
    for attacker_square in chess.SquareSet(board.occupied_co[attacker_color]):
        attacker = board.piece_at(attacker_square)
        assert attacker is not None
        if attacker.piece_type == chess.BISHOP:
            directions = DIAGONAL_DIRECTIONS
        elif attacker.piece_type == chess.ROOK:
            directions = ORTHOGONAL_DIRECTIONS
        elif attacker.piece_type == chess.QUEEN:
            directions = ORTHOGONAL_DIRECTIONS + DIAGONAL_DIRECTIONS
        else:
            continue

        attacker_file = chess.square_file(attacker_square)
        attacker_rank = chess.square_rank(attacker_square)
        for file_step, rank_step in directions:
            front_square: chess.Square | None = None
            front_piece: chess.Piece | None = None
            file_index = attacker_file + file_step
            rank_index = attacker_rank + rank_step
            while 0 <= file_index < 8 and 0 <= rank_index < 8:
                square = chess.square(file_index, rank_index)
                piece = board.piece_at(square)
                file_index += file_step
                rank_index += rank_step
                if piece is None:
                    continue
                if piece.color != target_color:
                    break
                if front_piece is None:
                    if piece.piece_type == chess.KING:
                        break
                    front_square = square
                    front_piece = piece
                    continue
                if (
                    piece.piece_type != chess.KING
                    and PIECE_VALUES.get(piece.piece_type, 0)
                    > PIECE_VALUES.get(front_piece.piece_type, 0)
                ):
                    assert front_square is not None
                    targets.add(front_square)
                break
    return targets


def _sliding_attack_pairs(
    board: chess.Board,
    attacker_color: chess.Color,
) -> set[tuple[chess.Square, chess.Square]]:
    """Return slider-to-valuable-target pairs visible in the current position."""
    pairs: set[tuple[chess.Square, chess.Square]] = set()
    valuable_types = {
        chess.KNIGHT,
        chess.BISHOP,
        chess.ROOK,
        chess.QUEEN,
        chess.KING,
    }
    for piece_type in (chess.BISHOP, chess.ROOK, chess.QUEEN):
        for attacker_square in board.pieces(piece_type, attacker_color):
            for target_square in board.attacks(attacker_square):
                target = board.piece_at(target_square)
                if (
                    target is not None
                    and target.color != attacker_color
                    and target.piece_type in valuable_types
                ):
                    pairs.add((attacker_square, target_square))
    return pairs


def _is_pawn_break(
    before: chess.Board,
    after: chess.Board,
    move: chess.Move,
    mover: chess.Color,
) -> bool:
    if before.is_capture(move):
        captured = _captured_piece(before, move)
        return captured is not None and captured.piece_type == chess.PAWN
    enemy_pawns = after.pieces(chess.PAWN, not mover)
    destination_attacks = after.attacks(move.to_square)
    return bool(destination_attacks & enemy_pawns) or bool(
        after.attackers(not mover, move.to_square) & enemy_pawns
    )


def _mobility_gain(
    before: chess.Board,
    after: chess.Board,
    move: chess.Move,
    piece: chess.Piece,
) -> int:
    if piece.piece_type in (chess.PAWN, chess.KING):
        return 0
    before_mobility = chess.popcount(
        int(before.attacks(move.from_square)) & ~before.occupied_co[piece.color]
    )
    after_mobility = chess.popcount(
        int(after.attacks(move.to_square)) & ~after.occupied_co[piece.color]
    )
    return after_mobility - before_mobility if before_mobility <= 4 else 0


def _center_distance(square: chess.Square) -> int:
    return min(chess.square_distance(square, center) for center in CENTER_SQUARES)


def _removed_defender_targets(
    before: chess.Board,
    after: chess.Board,
    move: chess.Move,
    mover: chess.Color,
) -> list[str]:
    if not before.is_capture(move):
        return []
    captured_square = (
        move.to_square + (-8 if mover == chess.WHITE else 8)
        if before.is_en_passant(move)
        else move.to_square
    )
    targets: list[str] = []
    for target_square in chess.SquareSet(before.occupied_co[not mover]):
        if target_square == captured_square or after.piece_at(target_square) is None:
            continue
        if (
            captured_square in before.attackers(not mover, target_square)
            and after.attackers(mover, target_square)
            and not after.attackers(not mover, target_square)
        ):
            targets.append(chess.square_name(target_square))
    return sorted(targets)


def _interfered_attack_targets(
    before: chess.Board,
    after: chess.Board,
    move: chess.Move,
    mover: chess.Color,
) -> list[str]:
    if before.is_capture(move):
        return []
    removed_pairs = _sliding_attack_pairs(before, not mover) - _sliding_attack_pairs(
        after, not mover
    )
    return sorted(
        {
            chess.square_name(target)
            for attacker, target in removed_pairs
            if bool(chess.between(attacker, target) & chess.BB_SQUARES[move.to_square])
        }
    )


def _rooks_connected(board: chess.Board, color: chess.Color) -> bool:
    rooks = list(board.pieces(chess.ROOK, color))
    return any(
        second in board.attacks(first)
        for first in rooks
        for second in rooks
        if first < second
    )


def _plan_hints(facts: MoveFacts) -> list[PlanHint]:
    hints: list[PlanHint] = []
    if facts.gives_checkmate:
        return ["deliver_checkmate"]
    elif facts.gives_check:
        hints.append("force_check_response")
    if facts.fork_targets:
        hints.append("fork_pieces")
    if facts.newly_pinned_targets:
        hints.append("pin_piece")
    if facts.newly_relative_pinned_targets:
        hints.append("relative_pin_piece")
    if facts.discovered_attack_targets:
        hints.append("discovered_attack")
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
    if facts.occupies_outpost:
        hints.append("occupy_outpost")
    elif facts.creates_outpost:
        hints.append("create_outpost")
    if facts.rook_to_open_file:
        hints.append("exploit_open_file")
    if facts.rook_to_seventh_rank:
        hints.append("activate_rook_on_seventh")
    if facts.pawn_break:
        hints.append("pawn_break")
    if facts.space_gain >= 2:
        hints.append("gain_space")
    if facts.mobility_gain >= 3 and not facts.develops_minor_piece:
        hints.append("improve_piece_activity")
    if facts.centralizes_king:
        hints.append("centralize_king")
    if facts.removed_defender_targets:
        hints.append("remove_defender")
    if facts.interfered_attack_targets:
        hints.append("interfere_attack")
    if facts.connects_rooks:
        hints.append("connect_rooks")
    return hints
