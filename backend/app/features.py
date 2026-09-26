import chess

from app.logging_config import get_logger, position_id
from app.models import (
    EndgameFeatures,
    FileFeatures,
    KingSafetyFeatures,
    MaterialFeatures,
    PawnFeatures,
    PositionFeaturesResponse,
    SideMaterial,
    StrategicFeatures,
    TacticalFeatures,
)

PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 330,
    chess.ROOK: 500,
    chess.QUEEN: 900,
}
FILES = "abcdefgh"
logger = get_logger(__name__)


def extract_position_features(fen: str) -> PositionFeaturesResponse:
    """Extract auditable chess facts without an engine or language model."""
    board = chess.Board(fen)
    phase = _phase(board)
    white_material = _material(board, chess.WHITE)
    black_material = _material(board, chess.BLACK)
    response = PositionFeaturesResponse(
        fen=fen,
        phase=phase,
        side_to_move="white" if board.turn == chess.WHITE else "black",
        material=MaterialFeatures(
            white=white_material,
            black=black_material,
            balance_cp=white_material.value_cp - black_material.value_cp,
        ),
        white_pawns=_pawn_features(board, chess.WHITE),
        black_pawns=_pawn_features(board, chess.BLACK),
        white_king=_king_safety(board, chess.WHITE),
        black_king=_king_safety(board, chess.BLACK),
        strategic=_strategic_features(board),
        endgame=_endgame_features(board, phase == "endgame"),
        tactics=_tactical_features(board),
    )
    logger.info(
        "position_features_extracted",
        extra={
            "event_data": {
                "position_id": position_id(fen),
                "phase": response.phase,
                "legal_move_count": response.tactics.legal_move_count,
            }
        },
    )
    return response


def _material(board: chess.Board, color: chess.Color) -> SideMaterial:
    counts = {
        piece_type: len(board.pieces(piece_type, color))
        for piece_type in PIECE_VALUES
    }
    return SideMaterial(
        pawns=counts[chess.PAWN],
        knights=counts[chess.KNIGHT],
        bishops=counts[chess.BISHOP],
        rooks=counts[chess.ROOK],
        queens=counts[chess.QUEEN],
        value_cp=sum(counts[piece_type] * value for piece_type, value in PIECE_VALUES.items()),
    )


def _phase(board: chess.Board) -> str:
    non_pawn_value = sum(
        len(board.pieces(piece_type, color)) * PIECE_VALUES[piece_type]
        for color in chess.COLORS
        for piece_type in (chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN)
    )
    if non_pawn_value <= 2_600:
        return "endgame"

    original_minor_squares = {
        chess.B1: chess.KNIGHT,
        chess.G1: chess.KNIGHT,
        chess.C1: chess.BISHOP,
        chess.F1: chess.BISHOP,
        chess.B8: chess.KNIGHT,
        chess.G8: chess.KNIGHT,
        chess.C8: chess.BISHOP,
        chess.F8: chess.BISHOP,
    }
    undeveloped = sum(
        board.piece_type_at(square) == piece_type
        for square, piece_type in original_minor_squares.items()
    )
    return "opening" if board.fullmove_number <= 15 and undeveloped >= 4 else "middlegame"


def _pawn_features(board: chess.Board, color: chess.Color) -> PawnFeatures:
    pawns = board.pieces(chess.PAWN, color)
    file_counts = [len(pawns & chess.BB_FILES[file_index]) for file_index in range(8)]
    doubled = [FILES[index] for index, count in enumerate(file_counts) if count > 1]
    isolated: list[str] = []
    passed: list[str] = []
    connected: list[str] = []
    backward: list[str] = []

    enemy_pawns = board.pieces(chess.PAWN, not color)
    for square in pawns:
        file_index = chess.square_file(square)
        rank = chess.square_rank(square)
        adjacent_files = [index for index in (file_index - 1, file_index + 1) if 0 <= index < 8]
        if all(file_counts[index] == 0 for index in adjacent_files):
            isolated.append(chess.square_name(square))

        if any(
            abs(chess.square_rank(other) - rank) <= 1
            for adjacent_file in adjacent_files
            for other in pawns & chess.BB_FILES[adjacent_file]
        ):
            connected.append(chess.square_name(square))

        forward_ranks = range(rank + 1, 8) if color == chess.WHITE else range(rank - 1, -1, -1)
        blocking_squares = chess.SquareSet()
        for target_file in range(max(0, file_index - 1), min(7, file_index + 1) + 1):
            for target_rank in forward_ranks:
                blocking_squares.add(chess.square(target_file, target_rank))
        if not (enemy_pawns & blocking_squares):
            passed.append(chess.square_name(square))

        forward_rank = rank + (1 if color == chess.WHITE else -1)
        if 0 <= forward_rank < 8 and adjacent_files:
            advance_square = chess.square(file_index, forward_rank)
            adjacent_ahead = any(
                (
                    chess.square_rank(other) > rank
                    if color == chess.WHITE
                    else chess.square_rank(other) < rank
                )
                for adjacent_file in adjacent_files
                for other in pawns & chess.BB_FILES[adjacent_file]
            )
            enemy_pawn_controls_advance = bool(
                board.attackers(not color, advance_square) & enemy_pawns
            )
            friendly_pawn_controls_advance = bool(
                board.attackers(color, advance_square) & pawns
            )
            if (
                adjacent_ahead
                and enemy_pawn_controls_advance
                and not friendly_pawn_controls_advance
            ):
                backward.append(chess.square_name(square))

    passed_set = set(passed)
    connected_set = set(connected)
    pawn_island_count = sum(
        count > 0 and (index == 0 or file_counts[index - 1] == 0)
        for index, count in enumerate(file_counts)
    )
    return PawnFeatures(
        doubled_files=doubled,
        isolated_squares=sorted(isolated),
        passed_squares=sorted(passed),
        pawn_island_count=pawn_island_count,
        connected_squares=sorted(connected),
        connected_passed_squares=sorted(passed_set & connected_set),
        backward_squares=sorted(backward),
    )


def _king_safety(board: chess.Board, color: chess.Color) -> KingSafetyFeatures:
    king_square = board.king(color)
    if king_square is None:
        raise ValueError("position has no king")
    king_file = chess.square_file(king_square)
    king_rank = chess.square_rank(king_square)
    home_rank = 0 if color == chess.WHITE else 7
    castled_position = king_rank == home_rank and king_file in (2, 6)

    shield_rank = king_rank + (1 if color == chess.WHITE else -1)
    shield_count = 0
    if 0 <= shield_rank < 8:
        for file_index in range(max(0, king_file - 1), min(7, king_file + 1) + 1):
            piece = board.piece_at(chess.square(file_index, shield_rank))
            shield_count += piece == chess.Piece(chess.PAWN, color)

    friendly_pawns = board.pieces(chess.PAWN, color)
    nearby_files = range(max(0, king_file - 1), min(7, king_file + 1) + 1)
    files_without_friendly_pawn = [
        FILES[file_index]
        for file_index in nearby_files
        if not (friendly_pawns & chess.BB_FILES[file_index])
    ]
    zone = chess.SquareSet(chess.BB_KING_ATTACKS[king_square] | chess.BB_SQUARES[king_square])
    attacked_zone = [square for square in zone if board.attackers(not color, square)]
    enemy_attackers = {
        attacker
        for square in zone
        for attacker in board.attackers(not color, square)
    }
    return KingSafetyFeatures(
        king_square=chess.square_name(king_square),
        castled_position=castled_position,
        pawn_shield_count=shield_count,
        files_without_friendly_pawn=files_without_friendly_pawn,
        attacked_zone_squares=sorted(chess.square_name(square) for square in attacked_zone),
        enemy_attackers=sorted(chess.square_name(square) for square in enemy_attackers),
    )


def _strategic_features(board: chess.Board) -> StrategicFeatures:
    white_pawns = board.pieces(chess.PAWN, chess.WHITE)
    black_pawns = board.pieces(chess.PAWN, chess.BLACK)
    open_files: list[str] = []
    white_semi_open: list[str] = []
    black_semi_open: list[str] = []
    for file_index, file_name in enumerate(FILES):
        has_white = bool(white_pawns & chess.BB_FILES[file_index])
        has_black = bool(black_pawns & chess.BB_FILES[file_index])
        if not has_white and not has_black:
            open_files.append(file_name)
        elif not has_white and has_black:
            white_semi_open.append(file_name)
        elif has_white and not has_black:
            black_semi_open.append(file_name)

    white_outposts = _potential_outposts(board, chess.WHITE)
    black_outposts = _potential_outposts(board, chess.BLACK)
    white_space = _space_count(board, chess.WHITE)
    black_space = _space_count(board, chess.BLACK)
    return StrategicFeatures(
        files=FileFeatures(
            open_files=open_files,
            white_semi_open_files=white_semi_open,
            black_semi_open_files=black_semi_open,
        ),
        white_bishop_pair=len(board.pieces(chess.BISHOP, chess.WHITE)) >= 2,
        black_bishop_pair=len(board.pieces(chess.BISHOP, chess.BLACK)) >= 2,
        white_weak_squares=_weak_squares(board, chess.WHITE),
        black_weak_squares=_weak_squares(board, chess.BLACK),
        white_potential_outposts=white_outposts,
        black_potential_outposts=black_outposts,
        white_occupied_outposts=_occupied_outposts(board, chess.WHITE, white_outposts),
        black_occupied_outposts=_occupied_outposts(board, chess.BLACK, black_outposts),
        white_space_count=white_space,
        black_space_count=black_space,
        space_balance=white_space - black_space,
        white_rooks_on_open_files=_rooks_on_files(board, chess.WHITE, open_files),
        black_rooks_on_open_files=_rooks_on_files(board, chess.BLACK, open_files),
        white_rooks_on_semi_open_files=_rooks_on_files(board, chess.WHITE, white_semi_open),
        black_rooks_on_semi_open_files=_rooks_on_files(board, chess.BLACK, black_semi_open),
        white_seventh_rank_rooks=_seventh_rank_rooks(board, chess.WHITE),
        black_seventh_rank_rooks=_seventh_rank_rooks(board, chess.BLACK),
        white_bad_bishops=_bad_bishops(board, chess.WHITE),
        black_bad_bishops=_bad_bishops(board, chess.BLACK),
        white_pawn_majority_wings=_pawn_majority_wings(board, chess.WHITE),
        black_pawn_majority_wings=_pawn_majority_wings(board, chess.BLACK),
        white_pawn_color_complex=_pawn_color_complex(board, chess.WHITE),
        black_pawn_color_complex=_pawn_color_complex(board, chess.BLACK),
    )


def _pawn_controls(board: chess.Board, color: chess.Color, square: chess.Square) -> bool:
    return bool(board.attackers(color, square) & board.pieces(chess.PAWN, color))


def _weak_squares(board: chess.Board, color: chess.Color) -> list[str]:
    """Pawn-controlled holes in the defender's central territory."""
    ranks = range(1, 4) if color == chess.WHITE else range(4, 7)
    weak = [
        chess.square_name(square)
        for file_index in range(1, 7)
        for rank_index in ranks
        if board.piece_at(square := chess.square(file_index, rank_index)) is None
        and not _pawn_controls(board, color, square)
        and _pawn_controls(board, not color, square)
    ]
    return sorted(weak)


def _potential_outposts(board: chess.Board, color: chess.Color) -> list[str]:
    """Stable advanced squares supported by a pawn and immune to enemy pawns."""
    ranks = range(3, 6) if color == chess.WHITE else range(2, 5)
    outposts = [
        chess.square_name(square)
        for file_index in range(1, 7)
        for rank_index in ranks
        if (
            (occupant := board.piece_at(square := chess.square(file_index, rank_index))) is None
            or occupant == chess.Piece(chess.KNIGHT, color)
        )
        and _pawn_controls(board, color, square)
        and not _pawn_controls(board, not color, square)
    ]
    return sorted(outposts)


def _occupied_outposts(
    board: chess.Board,
    color: chess.Color,
    potential: list[str],
) -> list[str]:
    potential_squares = {chess.parse_square(square) for square in potential}
    return sorted(
        chess.square_name(square)
        for square in board.pieces(chess.KNIGHT, color)
        if square in potential_squares
    )


def _space_count(board: chess.Board, color: chess.Color) -> int:
    """Count safe pawn-controlled squares in the opponent's half, excluding rim files."""
    ranks = range(4, 8) if color == chess.WHITE else range(0, 4)
    controlled = 0
    for file_index in range(1, 7):
        for rank_index in ranks:
            square = chess.square(file_index, rank_index)
            if _pawn_controls(board, color, square) and not _pawn_controls(
                board, not color, square
            ):
                controlled += 1
    return controlled


def _rooks_on_files(
    board: chess.Board,
    color: chess.Color,
    file_names: list[str],
) -> list[str]:
    file_indexes = {FILES.index(file_name) for file_name in file_names}
    return sorted(
        chess.square_name(square)
        for square in board.pieces(chess.ROOK, color)
        if chess.square_file(square) in file_indexes
    )


def _seventh_rank_rooks(board: chess.Board, color: chess.Color) -> list[str]:
    target_rank = 6 if color == chess.WHITE else 1
    return sorted(
        chess.square_name(square)
        for square in board.pieces(chess.ROOK, color)
        if chess.square_rank(square) == target_rank
    )


def _bad_bishops(board: chess.Board, color: chess.Color) -> list[str]:
    bad: list[str] = []
    friendly_pawns = board.pieces(chess.PAWN, color)
    for bishop_square in board.pieces(chess.BISHOP, color):
        same_color_pawns = sum(
            _is_light_square(pawn_square) == _is_light_square(bishop_square)
            for pawn_square in friendly_pawns
        )
        mobility = chess.popcount(int(board.attacks(bishop_square)) & ~board.occupied_co[color])
        if same_color_pawns >= 3 and mobility <= 4:
            bad.append(chess.square_name(bishop_square))
    return sorted(bad)


def _pawn_majority_wings(board: chess.Board, color: chess.Color) -> list[str]:
    friendly = board.pieces(chess.PAWN, color)
    enemy = board.pieces(chess.PAWN, not color)
    wings = {
        "queenside": range(0, 4),
        "kingside": range(4, 8),
    }
    return [
        wing
        for wing, files in wings.items()
        if sum(len(friendly & chess.BB_FILES[index]) for index in files)
        > sum(len(enemy & chess.BB_FILES[index]) for index in files)
    ]


def _pawn_color_complex(
    board: chess.Board,
    color: chess.Color,
) -> str:
    pawns = board.pieces(chess.PAWN, color)
    light = sum(_is_light_square(square) for square in pawns)
    dark = len(pawns) - light
    if light - dark >= 2:
        return "light"
    if dark - light >= 2:
        return "dark"
    return "balanced"


def _endgame_features(board: chess.Board, active: bool) -> EndgameFeatures:
    counts = {
        (color, piece_type): len(board.pieces(piece_type, color))
        for color in chess.COLORS
        for piece_type in (chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN)
    }
    no_queens = all(counts[color, chess.QUEEN] == 0 for color in chess.COLORS)
    no_rooks = all(counts[color, chess.ROOK] == 0 for color in chess.COLORS)
    no_knights = all(counts[color, chess.KNIGHT] == 0 for color in chess.COLORS)
    no_bishops = all(counts[color, chess.BISHOP] == 0 for color in chess.COLORS)
    has_pawns = bool(board.pawns)
    one_bishop_each = all(counts[color, chess.BISHOP] == 1 for color in chess.COLORS)
    bishop_only = active and no_queens and no_rooks and no_knights and one_bishop_each

    bishops = [
        next(iter(board.pieces(chess.BISHOP, color)))
        for color in (chess.WHITE, chess.BLACK)
        if counts[color, chess.BISHOP] == 1
    ]
    opposite_colored = bishop_only and _is_light_square(bishops[0]) != _is_light_square(bishops[1])
    same_colored = bishop_only and not opposite_colored

    white_king = board.king(chess.WHITE)
    black_king = board.king(chess.BLACK)
    assert white_king is not None and black_king is not None
    same_file = chess.square_file(white_king) == chess.square_file(black_king)
    same_rank = chess.square_rank(white_king) == chess.square_rank(black_king)
    facing = (same_file or same_rank) and chess.square_distance(white_king, black_king) == 2
    opposition_holder = None
    if active and facing:
        opposition_holder = "black" if board.turn == chess.WHITE else "white"

    queen_endgame = (
        active
        and no_rooks
        and no_knights
        and no_bishops
        and all(counts[color, chess.QUEEN] == 1 for color in chess.COLORS)
    )
    minor_piece_endgame = (
        active
        and no_queens
        and no_rooks
        and any(
            counts[color, chess.KNIGHT] + counts[color, chess.BISHOP] > 0
            for color in chess.COLORS
        )
    )
    rook_and_minor_endgame = (
        active
        and no_queens
        and all(counts[color, chess.ROOK] >= 1 for color in chess.COLORS)
        and any(
            counts[color, chess.KNIGHT] + counts[color, chess.BISHOP] > 0
            for color in chess.COLORS
        )
    )

    return EndgameFeatures(
        active=active,
        king_and_pawn_endgame=(
            active and has_pawns and no_queens and no_rooks and no_knights and no_bishops
        ),
        pure_rook_endgame=(
            active
            and no_queens
            and no_knights
            and no_bishops
            and all(counts[color, chess.ROOK] == 1 for color in chess.COLORS)
        ),
        opposite_colored_bishop_endgame=opposite_colored,
        same_colored_bishop_endgame=same_colored,
        direct_opposition_holder=opposition_holder,
        queen_endgame=queen_endgame,
        minor_piece_endgame=minor_piece_endgame,
        rook_and_minor_endgame=rook_and_minor_endgame,
        wrong_bishop_rook_pawn_side=_wrong_bishop_rook_pawn_side(board, active),
    )


def _wrong_bishop_rook_pawn_side(
    board: chess.Board,
    active: bool,
) -> str | None:
    """Recognize the strict lone rook-pawn plus wrong bishop fortress motif."""
    if not active:
        return None
    for color, name in ((chess.WHITE, "white"), (chess.BLACK, "black")):
        own_pawns = board.pieces(chess.PAWN, color)
        own_bishops = board.pieces(chess.BISHOP, color)
        own_other = sum(
            len(board.pieces(piece_type, color))
            for piece_type in (chess.KNIGHT, chess.ROOK, chess.QUEEN)
        )
        enemy_material = sum(
            len(board.pieces(piece_type, not color))
            for piece_type in (chess.PAWN, chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN)
        )
        if len(own_pawns) != 1 or len(own_bishops) != 1 or own_other or enemy_material:
            continue
        pawn_square = next(iter(own_pawns))
        if chess.square_file(pawn_square) not in (0, 7):
            continue
        promotion_square = chess.square(
            chess.square_file(pawn_square),
            7 if color == chess.WHITE else 0,
        )
        bishop_square = next(iter(own_bishops))
        if _is_light_square(bishop_square) != _is_light_square(promotion_square):
            return name
    return None


def _is_light_square(square: chess.Square) -> bool:
    return (chess.square_file(square) + chess.square_rank(square)) % 2 == 1


def _undefended_attacked(board: chess.Board, color: chess.Color) -> list[str]:
    squares: list[str] = []
    for square in chess.SquareSet(board.occupied_co[color]):
        piece = board.piece_at(square)
        if piece is None or piece.piece_type in (chess.PAWN, chess.KING):
            continue
        if board.attackers(not color, square) and not board.attackers(color, square):
            squares.append(chess.square_name(square))
    return sorted(squares)


def _pinned_pieces(board: chess.Board, color: chess.Color) -> list[str]:
    return sorted(
        chess.square_name(square)
        for square in chess.SquareSet(board.occupied_co[color])
        if board.piece_type_at(square) != chess.KING and board.is_pinned(color, square)
    )


def _tactical_features(board: chess.Board) -> TacticalFeatures:
    legal_moves = list(board.legal_moves)
    checking_moves = [move for move in legal_moves if board.gives_check(move)]
    mate_in_one_moves: list[str] = []
    for move in checking_moves:
        after = board.copy(stack=False)
        after.push(move)
        if after.is_checkmate():
            mate_in_one_moves.append(move.uci())
    return TacticalFeatures(
        side_to_move_in_check=board.is_check(),
        legal_move_count=len(legal_moves),
        capture_count=sum(board.is_capture(move) for move in legal_moves),
        checking_moves=sorted(move.uci() for move in checking_moves),
        mate_in_one_moves=sorted(mate_in_one_moves),
        white_pinned=_pinned_pieces(board, chess.WHITE),
        black_pinned=_pinned_pieces(board, chess.BLACK),
        white_undefended_attacked=_undefended_attacked(board, chess.WHITE),
        black_undefended_attacked=_undefended_attacked(board, chess.BLACK),
        white_overloaded=_overloaded_pieces(board, chess.WHITE),
        black_overloaded=_overloaded_pieces(board, chess.BLACK),
    )


def _overloaded_pieces(board: chess.Board, color: chess.Color) -> list[str]:
    """Pieces that are the sole defender of two attacked, non-pawn assets."""
    responsibilities: dict[chess.Square, int] = {}
    for target in chess.SquareSet(board.occupied_co[color]):
        target_piece = board.piece_at(target)
        if target_piece is None or target_piece.piece_type in (chess.PAWN, chess.KING):
            continue
        if not board.attackers(not color, target):
            continue
        defenders = [
            square
            for square in board.attackers(color, target)
            if board.piece_type_at(square) != chess.KING
        ]
        if len(defenders) == 1:
            defender = defenders[0]
            responsibilities[defender] = responsibilities.get(defender, 0) + 1
    return sorted(
        chess.square_name(square)
        for square, count in responsibilities.items()
        if count >= 2
    )
