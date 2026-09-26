import chess

from app.repertoire import match_repertoire


def fen_after(*moves: str) -> str:
    board = chess.Board()
    for move in moves:
        board.push_uci(move)
    return board.fen()


def test_matches_london_piece_signature() -> None:
    repertoire = match_repertoire(fen_after("d2d4", "d7d5", "g1f3", "g8f6", "c1f4"))

    assert repertoire is not None
    assert repertoire.id == "london"
    assert repertoire.side == "white"


def test_keeps_london_after_the_normal_bishop_retreat() -> None:
    repertoire = match_repertoire(
        fen_after(
            "d2d4",
            "d7d5",
            "g1f3",
            "g8f6",
            "c1f4",
            "e7e6",
            "e2e3",
            "f8d6",
            "f4g3",
        )
    )

    assert repertoire is not None
    assert repertoire.id == "london"


def test_matches_e6_sicilian_and_kings_indian() -> None:
    sicilian = match_repertoire(fen_after("e2e4", "c7c5", "g1f3", "e7e6"))
    kings_indian = match_repertoire(
        fen_after("d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7")
    )

    assert sicilian is not None and sicilian.id == "sicilian_e6"
    assert kings_indian is not None and kings_indian.id == "kings_indian"


def test_keeps_sicilian_after_the_c_pawn_is_exchanged() -> None:
    repertoire = match_repertoire(
        fen_after("e2e4", "c7c5", "g1f3", "e7e6", "d2d4", "c5d4", "f3d4")
    )

    assert repertoire is not None
    assert repertoire.id == "sicilian_e6"


def test_matches_kings_indian_setup_through_reti_move_order_but_not_pirc() -> None:
    reti = match_repertoire(
        fen_after("g1f3", "g8f6", "c2c4", "g7g6", "g2g3", "f8g7")
    )
    pirc = match_repertoire(
        fen_after("e2e4", "g8f6", "d2d3", "g7g6", "g1f3", "f8g7")
    )

    assert reti is not None and reti.id == "kings_indian"
    assert pirc is None


def test_does_not_force_a_repertoire_on_unrelated_position() -> None:
    assert match_repertoire(chess.STARTING_FEN) is None
