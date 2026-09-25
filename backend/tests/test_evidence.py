import chess

from app.evidence import build_analysis_evidence
from app.models import AnalyzeResponse, MoveAnalysis


def candidate(board: chess.Board, uci: str) -> MoveAnalysis:
    move = chess.Move.from_uci(uci)
    return MoveAnalysis(
        uci=uci,
        san=board.san(move),
        score_cp=20,
        mate=None,
        pv_uci=[uci],
        pv_san=[board.san(move)],
        replies=[],
    )


def response(board: chess.Board, *moves: str) -> AnalyzeResponse:
    return AnalyzeResponse(
        fen=board.fen(),
        actor="user",
        advisor_role="user",
        reply_role="opponent",
        evaluation_cp=20,
        evaluation_mate=None,
        candidates=[candidate(board, move) for move in moves],
    )


def test_development_and_center_are_explicit_hints() -> None:
    board = chess.Board()
    evidence = build_analysis_evidence(response(board, "g1f3", "e2e4"))

    assert evidence.candidates[0].plan_hints == ["develop_and_coordinate"]
    assert evidence.candidates[1].plan_hints == ["contest_center"]
    assert evidence.candidates[0].facts.fork_targets == []
    assert evidence.candidates[0].facts.newly_pinned_targets == []
    assert evidence.candidates[0].facts.newly_attacked_undefended_targets == []


def test_castling_is_a_king_safety_hint() -> None:
    board = chess.Board("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1")
    evidence = build_analysis_evidence(response(board, "e1g1"))

    assert evidence.candidates[0].facts.is_castling is True
    assert evidence.candidates[0].plan_hints == ["secure_king"]


def test_capture_and_check_are_separate_facts() -> None:
    board = chess.Board("k7/8/8/8/8/8/4q3/4R1K1 w - - 0 1")
    evidence = build_analysis_evidence(response(board, "e1e2"))

    candidate_evidence = evidence.candidates[0]
    assert candidate_evidence.facts.captured_piece == "queen"
    assert candidate_evidence.facts.gives_check is False
    assert candidate_evidence.plan_hints == ["capture_or_exchange_material"]


def test_passed_pawn_push_is_identified() -> None:
    board = chess.Board("4k3/8/8/3P4/8/8/8/4K3 w - - 0 1")
    evidence = build_analysis_evidence(response(board, "d5d6"))

    assert evidence.candidates[0].facts.moves_passed_pawn is True
    assert "advance_passed_pawn" in evidence.candidates[0].plan_hints


def test_checkmate_is_distinct_from_an_ordinary_check() -> None:
    board = chess.Board("7k/8/5KQ1/8/8/8/8/8 w - - 0 1")
    evidence = build_analysis_evidence(response(board, "g6g7"))

    facts = evidence.candidates[0].facts
    assert facts.gives_check is True
    assert facts.gives_checkmate is True
    assert evidence.candidates[0].plan_hints == ["deliver_checkmate"]


def test_knight_fork_records_the_attacked_high_value_targets() -> None:
    board = chess.Board("8/3q1k2/8/8/2N5/8/8/K7 w - - 0 1")
    evidence = build_analysis_evidence(response(board, "c4e5"))

    facts = evidence.candidates[0].facts
    assert facts.fork_targets == ["d7", "f7"]
    assert "fork_pieces" in evidence.candidates[0].plan_hints


def test_black_knight_fork_uses_the_same_target_semantics() -> None:
    board = chess.Board("k7/8/8/2n5/8/8/3Q1K2/8 b - - 0 1")
    evidence = build_analysis_evidence(response(board, "c5e4"))

    assert evidence.candidates[0].facts.fork_targets == ["d2", "f2"]
    assert "fork_pieces" in evidence.candidates[0].plan_hints


def test_move_can_create_an_absolute_pin() -> None:
    board = chess.Board("4k3/8/2n5/8/2B5/8/8/4K3 w - - 0 1")
    evidence = build_analysis_evidence(response(board, "c4b5"))

    facts = evidence.candidates[0].facts
    assert facts.newly_pinned_targets == ["c6"]
    assert "pin_piece" in evidence.candidates[0].plan_hints


def test_move_can_attack_an_undefended_piece() -> None:
    board = chess.Board("4k3/8/3q4/8/8/2N5/8/4K3 w - - 0 1")
    evidence = build_analysis_evidence(response(board, "c3b5"))

    facts = evidence.candidates[0].facts
    assert facts.newly_attacked_undefended_targets == ["d6"]
    assert "attack_loose_piece" in evidence.candidates[0].plan_hints


def test_defended_target_is_not_reported_as_loose() -> None:
    board = chess.Board("8/4k3/3q4/8/8/2N5/8/4K3 w - - 0 1")
    evidence = build_analysis_evidence(response(board, "c3b5"))

    assert evidence.candidates[0].facts.newly_attacked_undefended_targets == []
    assert "attack_loose_piece" not in evidence.candidates[0].plan_hints
