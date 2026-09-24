import chess

from app.models import (
    KingSafetyFeatures,
    MaterialFeatures,
    PawnFeatures,
    PositionFeaturesResponse,
    SideMaterial,
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


def extract_position_features(fen: str) -> PositionFeaturesResponse:
    """Extract auditable chess facts without an engine or language model."""
    board = chess.Board(fen)
    white_material = _material(board, chess.WHITE)
    black_material = _material(board, chess.BLACK)
    return PositionFeaturesResponse(
        fen=fen,
        phase=_phase(board),
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
        tactics=_tactical_features(board),
    )


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

    enemy_pawns = board.pieces(chess.PAWN, not color)
    for square in pawns:
        file_index = chess.square_file(square)
        adjacent_files = [index for index in (file_index - 1, file_index + 1) if 0 <= index < 8]
        if all(file_counts[index] == 0 for index in adjacent_files):
            isolated.append(chess.square_name(square))

        rank = chess.square_rank(square)
        forward_ranks = range(rank + 1, 8) if color == chess.WHITE else range(rank - 1, -1, -1)
        blocking_squares = chess.SquareSet()
        for target_file in range(max(0, file_index - 1), min(7, file_index + 1) + 1):
            for target_rank in forward_ranks:
                blocking_squares.add(chess.square(target_file, target_rank))
        if not (enemy_pawns & blocking_squares):
            passed.append(chess.square_name(square))

    return PawnFeatures(
        doubled_files=doubled,
        isolated_squares=sorted(isolated),
        passed_squares=sorted(passed),
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
    open_files = [
        FILES[file_index]
        for file_index in nearby_files
        if not (friendly_pawns & chess.BB_FILES[file_index])
    ]
    return KingSafetyFeatures(
        king_square=chess.square_name(king_square),
        castled_position=castled_position,
        pawn_shield_count=shield_count,
        open_nearby_files=open_files,
    )


def _undefended_attacked(board: chess.Board, color: chess.Color) -> list[str]:
    squares: list[str] = []
    for square in chess.SquareSet(board.occupied_co[color]):
        piece = board.piece_at(square)
        if piece is None or piece.piece_type in (chess.PAWN, chess.KING):
            continue
        if board.attackers(not color, square) and not board.attackers(color, square):
            squares.append(chess.square_name(square))
    return sorted(squares)


def _tactical_features(board: chess.Board) -> TacticalFeatures:
    legal_moves = list(board.legal_moves)
    return TacticalFeatures(
        side_to_move_in_check=board.is_check(),
        legal_move_count=len(legal_moves),
        capture_count=sum(board.is_capture(move) for move in legal_moves),
        checking_moves=sorted(move.uci() for move in legal_moves if board.gives_check(move)),
        white_undefended_attacked=_undefended_attacked(board, chess.WHITE),
        black_undefended_attacked=_undefended_attacked(board, chess.BLACK),
    )
