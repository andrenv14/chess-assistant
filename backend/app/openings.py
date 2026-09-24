import csv
from pathlib import Path
from threading import Lock

import chess

from app.logging_config import get_logger
from app.models import OpeningInfo

logger = get_logger(__name__)
DEFAULT_OPENINGS_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "lichess_openings.tsv"
)


class OpeningBook:
    """Read-only position index built from the Lichess chess-openings dataset.

    The index is loaded on first use. Positions are keyed by EPD (the first four
    FEN fields), so site-specific move counters do not affect a match.
    """

    def __init__(self, path: Path = DEFAULT_OPENINGS_PATH) -> None:
        self.path = path
        self._records: dict[str, OpeningInfo] | None = None
        self._load_lock = Lock()

    @property
    def size(self) -> int:
        return len(self._get_records())

    def lookup_fen(self, fen: str) -> OpeningInfo | None:
        board = chess.Board(fen)
        return self._get_records().get(board.epd())

    def _get_records(self) -> dict[str, OpeningInfo]:
        if self._records is not None:
            return self._records

        with self._load_lock:
            if self._records is None:
                self._records = self._load()
        return self._records

    def _load(self) -> dict[str, OpeningInfo]:
        records: dict[str, OpeningInfo] = {}
        collisions = 0
        with self.path.open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle, delimiter="\t")
            expected = {"eco", "name", "pgn", "uci", "epd"}
            if set(reader.fieldnames or ()) != expected:
                raise ValueError(f"unexpected opening dataset columns: {reader.fieldnames}")

            for row in reader:
                uci_moves = row["uci"].split()
                record = OpeningInfo(
                    eco=row["eco"],
                    name=row["name"],
                    pgn=row["pgn"],
                    uci_moves=uci_moves,
                    ply_count=len(uci_moves),
                )
                if row["epd"] in records:
                    collisions += 1
                    continue
                records[row["epd"]] = record

        logger.info(
            "opening_book_loaded",
            extra={
                "event_data": {
                    "position_count": len(records),
                    "transposition_collisions": collisions,
                }
            },
        )
        return records


opening_book = OpeningBook()
