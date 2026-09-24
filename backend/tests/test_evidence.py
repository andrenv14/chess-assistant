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
    assert candidate_evidence.plan_hints == ["trade_or_win_material"]


def test_passed_pawn_push_is_identified() -> None:
    board = chess.Board("4k3/8/8/3P4/8/8/8/4K3 w - - 0 1")
    evidence = build_analysis_evidence(response(board, "d5d6"))

    assert evidence.candidates[0].facts.moves_passed_pawn is True
    assert "advance_passed_pawn" in evidence.candidates[0].plan_hints
