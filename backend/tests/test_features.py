import chess

from app.features import extract_position_features


def test_starting_position_has_balanced_opening_features() -> None:
    features = extract_position_features(chess.STARTING_FEN)

    assert features.phase == "opening"
    assert features.material.balance_cp == 0
    assert features.material.white.value_cp == 4_000
    assert features.white_pawns.doubled_files == []
    assert features.white_king.pawn_shield_count == 3
    assert features.tactics.legal_move_count == 20


def test_low_material_position_is_an_endgame() -> None:
    features = extract_position_features("8/8/8/3k4/8/4K3/3P4/8 w - - 0 1")

    assert features.phase == "endgame"
    assert features.material.balance_cp == 100
    assert features.white_pawns.passed_squares == ["d2"]


def test_detects_doubled_and_isolated_pawns() -> None:
    features = extract_position_features("4k3/8/8/8/2P5/2P5/8/4K3 w - - 0 1")

    assert features.white_pawns.doubled_files == ["c"]
    assert features.white_pawns.isolated_squares == ["c3", "c4"]


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
