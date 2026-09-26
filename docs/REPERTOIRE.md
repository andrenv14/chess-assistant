# Focused opening repertoire

The first specialised repertoire deliberately covers three systems:

- White: London System;
- Black against `1.e4`: the `...c5/...e6` Sicilian complex, especially Kan
  and Taimanov;
- Black against `1.d4` and compatible closed openings: King's Indian setup.

## Data boundaries

Opening names, ECO codes and exact-position recognition continue to use the
bundled [Lichess chess-openings](https://github.com/lichess-org/chess-openings)
catalogue, released under CC0. The catalogue is a nomenclature/line dataset;
it does not claim to contain prose plans or tactical explanations.

`backend/app/repertoire.py` therefore holds a small reviewed knowledge layer
for plans, counterplans, tactical themes, practical traps and model lines. It
is intentionally auditable rather than generated at runtime. Stockfish remains
authoritative for the current position and candidate ordering. A repertoire
idea may contextualise a candidate, but it must never replace or reorder the
engine output.

## Recognition

The matcher uses resilient early-position signatures instead of requiring one
exact move order:

- London: a white pawn on `d4` and white bishop on `f4`;
- Kan/Taimanov complex: white pawn on `e4`, black pawns on `c5` and `e6`;
- King's Indian/compatible setup: no white pawn on `e4`, plus a black knight on
  `f6`, pawn on `g6` and bishop on `g7`. This also accepts English and Réti move
  orders without mislabelling the Pirc.

Recognition stops after move 24. This avoids presenting opening-specific prose
as if it were still decisive deep in an unrelated middlegame. Transpositions
within that window are accepted.

## UI and LLM use

When matched, repertoire knowledge appears in the third column of the analysis
screen and as a detailed section in the Knowledge page. The same local facts
are converted into support statements for the explanation prompt. The LLM can
make the prose natural, but its claims still have to cite accepted support IDs
and its candidate order must exactly match Stockfish.

## Tests

`backend/tests/test_repertoire.py` covers the three signatures and a negative
case. Explanation validation and the existing evidence tests protect the
Stockfish-first boundary.
