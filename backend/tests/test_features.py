import chess

from app.features import extract_position_features


def test_starting_position_has_balanced_opening_features() -> None:
    features = extract_position_features(chess.STARTING_FEN)

    assert features.phase == "opening"
    assert features.material.balance_cp == 0
    assert features.material.white.value_cp == 4_000
    assert features.white_pawns.doubled_files == []
    assert features.white_pawns.pawn_island_count == 1
    assert len(features.white_pawns.connected_squares) == 8
    assert features.white_king.pawn_shield_count == 3
    assert features.strategic.files.open_files == []
    assert features.strategic.white_bishop_pair is True
    assert features.strategic.black_bishop_pair is True
    assert features.endgame.active is False
    assert features.tactics.legal_move_count == 20


def test_low_material_position_is_an_endgame() -> None:
    features = extract_position_features("8/8/8/3k4/8/4K3/3P4/8 w - - 0 1")

    assert features.phase == "endgame"
    assert features.material.balance_cp == 100
    assert features.white_pawns.passed_squares == ["d2"]
    assert features.endgame.king_and_pawn_endgame is True


def test_detects_doubled_and_isolated_pawns() -> None:
    features = extract_position_features("4k3/8/8/8/2P5/2P5/8/4K3 w - - 0 1")

    assert features.white_pawns.doubled_files == ["c"]
    assert features.white_pawns.isolated_squares == ["c3", "c4"]
    assert features.white_pawns.connected_squares == []


def test_detects_pawn_islands_and_connected_passers() -> None:
    features = extract_position_features("4k3/8/8/8/3PP3/1P6/P7/4K3 w - - 0 1")

    assert features.white_pawns.pawn_island_count == 2
    assert features.white_pawns.connected_squares == ["a2", "b3", "d4", "e4"]
    assert features.white_pawns.connected_passed_squares == ["a2", "b3", "d4", "e4"]


def test_detects_open_and_semi_open_files() -> None:
    features = extract_position_features("4k3/2pp4/8/8/8/8/P1P5/4K3 w - - 0 1")

    files = features.strategic.files
    assert files.open_files == ["b", "e", "f", "g", "h"]
    assert files.white_semi_open_files == ["d"]
    assert files.black_semi_open_files == ["a"]


def test_reports_enemy_pressure_in_the_king_zone() -> None:
    features = extract_position_features("4k3/8/8/2b5/7q/8/5PPP/6K1 w - - 0 1")

    assert features.white_king.attacked_zone_squares == ["f2", "h2"]
    assert features.white_king.enemy_attackers == ["c5", "h4"]


def test_identifies_strict_rook_endgame() -> None:
    features = extract_position_features("r3k3/8/8/8/8/8/8/R3K3 w - - 0 1")

    assert features.endgame.active is True
    assert features.endgame.pure_rook_endgame is True
    assert features.endgame.king_and_pawn_endgame is False


def test_extra_minor_piece_prevents_pure_rook_endgame_label() -> None:
    features = extract_position_features("r3k3/8/8/8/8/8/8/RN2K3 w - - 0 1")

    assert features.endgame.pure_rook_endgame is False


def test_identifies_opposite_and_same_colored_bishop_endgames() -> None:
    opposite = extract_position_features("2b1k3/8/8/8/8/8/8/2B1K3 w - - 0 1")
    same = extract_position_features("4kb2/8/8/8/8/8/8/2B1K3 w - - 0 1")

    assert opposite.endgame.opposite_colored_bishop_endgame is True
    assert opposite.endgame.same_colored_bishop_endgame is False
    assert same.endgame.opposite_colored_bishop_endgame is False
    assert same.endgame.same_colored_bishop_endgame is True


def test_extra_rook_prevents_pure_bishop_endgame_label() -> None:
    features = extract_position_features("2b1k2r/8/8/8/8/8/8/2B1K3 w - - 0 1")

    assert features.endgame.opposite_colored_bishop_endgame is False
    assert features.endgame.same_colored_bishop_endgame is False


def test_bare_kings_are_not_called_a_king_and_pawn_endgame() -> None:
    features = extract_position_features("8/8/8/8/8/8/8/K6k w - - 0 1")

    assert features.endgame.king_and_pawn_endgame is False


def test_direct_opposition_belongs_to_the_side_not_to_move() -> None:
    white_to_move = extract_position_features("8/8/4k3/8/4K3/8/8/8 w - - 0 1")
    black_to_move = extract_position_features("8/8/4k3/8/4K3/8/8/8 b - - 0 1")

    assert white_to_move.endgame.direct_opposition_holder == "black"
    assert black_to_move.endgame.direct_opposition_holder == "white"


def test_reports_checking_moves_as_uci_facts() -> None:
    features = extract_position_features("4k3/8/8/8/8/8/4R3/4K3 w - - 0 1")

    assert "e2e7" in features.tactics.checking_moves


def test_reports_absolute_pins() -> None:
    features = extract_position_features("4k3/8/2n5/1B6/8/8/8/4K3 b - - 0 1")

    assert features.tactics.black_pinned == ["c6"]
    assert features.tactics.white_pinned == []


def test_does_not_call_a_relative_queen_alignment_an_absolute_pin() -> None:
    features = extract_position_features("4q1k1/8/2n5/1B6/8/8/8/4K3 b - - 0 1")

    assert features.tactics.black_pinned == []


def test_reports_mate_in_one_as_a_legal_move_fact() -> None:
    features = extract_position_features("7k/8/5KQ1/8/8/8/8/8 w - - 0 1")

    assert "g6g7" in features.tactics.mate_in_one_moves
    assert set(features.tactics.mate_in_one_moves) <= set(features.tactics.checking_moves)


def test_reports_mate_in_one_for_black() -> None:
    features = extract_position_features("8/8/8/8/8/5kq1/8/7K b - - 0 1")

    assert "g3g2" in features.tactics.mate_in_one_moves


def test_marks_castled_king_position_and_shield() -> None:
    features = extract_position_features("4k3/8/8/8/8/8/5PPP/5RK1 w - - 0 1")

    assert features.white_king.castled_position is True
    assert features.white_king.pawn_shield_count == 3


def test_identifies_pawn_supported_outpost_and_weak_square() -> None:
    outpost = extract_position_features("4k3/8/8/3N4/2P1P3/8/8/4K3 w - - 0 1")
    weaknesses = extract_position_features("4k3/8/8/2p1p3/8/8/8/4K3 w - - 0 1")

    assert "d5" in outpost.strategic.white_potential_outposts
    assert outpost.strategic.white_occupied_outposts == ["d5"]
    assert "d4" in weaknesses.strategic.white_weak_squares


def test_reports_space_bad_bishop_and_pawn_majority() -> None:
    space = extract_position_features("4k3/8/8/8/4P3/8/8/4K3 w - - 0 1")
    bishop = extract_position_features("4k3/8/8/8/8/8/1P1P1P2/2B1K3 w - - 0 1")
    majority = extract_position_features("4k3/7p/8/8/8/8/PPP5/4K3 w - - 0 1")

    assert space.strategic.white_space_count == 2
    assert bishop.strategic.white_bad_bishops == ["c1"]
    assert majority.strategic.white_pawn_majority_wings == ["queenside"]
    assert majority.strategic.black_pawn_majority_wings == ["kingside"]


def test_reports_rooks_on_open_files_and_seventh_rank() -> None:
    features = extract_position_features("4k3/R7/8/8/8/8/8/4K3 w - - 0 1")

    assert features.strategic.white_rooks_on_open_files == ["a7"]
    assert features.strategic.white_seventh_rank_rooks == ["a7"]
