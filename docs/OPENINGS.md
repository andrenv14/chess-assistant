# Opening knowledge

## Source and license

The bundled catalog is generated from the official
[`lichess-org/chess-openings`](https://github.com/lichess-org/chess-openings)
dataset at revision `c67912be581f0793dbaa776be5ccf111e01f88d9`.

The dataset is dedicated to the public domain under CC0 1.0. A copy of its
license is stored in `backend/data/LICHESS_OPENINGS_CC0.txt`. The generated TSV
is committed so the local app does not need an API token or network access.

## Lookup semantics

Each opening is indexed by EPD: piece placement, side to move, castling rights
and legal en-passant square. Half-move and full-move counters are ignored.

The result means **the current position appears in the opening catalog**. It
does not prove that the player followed the catalog's PGN move order. This
distinction matters for transpositions. The source currently has two duplicate
EPD keys; the importer keeps the first source record deterministically until a
future session-history index can disambiguate them.

## Move classification

Book status is derived by the backend from the resulting position. Clients
cannot force a move to be labeled `Livro`. Stockfish still calculates the
objective expected-points loss, best move and evaluations, and those values are
returned even when the presentation label is `Livro`.

## Updating the catalog

1. Check out a reviewed revision of `lichess-org/chess-openings`.
2. Run its `bin/gen.py` over `a.tsv` through `e.tsv` with this backend's Python
   environment.
3. Replace `backend/data/lichess_openings.tsv` and the CC0 license copy.
4. Update the pinned revision above and run the complete backend test suite.

Never update the dataset implicitly at app startup. Changes must be reviewable,
tested and reproducible.
