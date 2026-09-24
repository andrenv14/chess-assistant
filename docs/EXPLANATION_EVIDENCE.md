# Candidate evidence for explanations

`POST /api/evidence` is the canonical analysis entry point for the desktop. It
runs the configured Stockfish advisor and opponent engines, keeps the
full-strength evaluator as the objective authority, and then annotates each
candidate with deterministic move facts.

## Candidate facts

- capture and captured piece type;
- check;
- castling;
- promotion;
- minor-piece development from its home square;
- occupation of `d4`, `e4`, `d5` or `e5`;
- passed-pawn advance or creation;
- immediate improvement in the king's pawn shield.

Facts become stable plan-hint identifiers such as `secure_king`,
`develop_and_coordinate` and `advance_passed_pawn`. Portuguese labels belong to
the desktop presentation layer; the identifiers remain language-neutral for
tests and provider prompts.

## Authority and non-claims

The hint `trade_or_win_material` means only that the candidate captures a
piece. Whether the exchange wins, loses or merely trades material must come
from the Stockfish evaluation and principal variation. Likewise, a check is
described as forcing a king response, not automatically as a good move.

Maia output is never an input to this endpoint. Maia cannot add, remove, rerank
or change the evaluation of Stockfish candidates.

## LLM boundary

The API prompt receives this structured bundle and must return a
schema-validated explanation. It may turn evidence into natural Portuguese,
but it may not:

- invent tactics absent from the principal variation;
- call a move best when it is not Stockfish rank 1;
- replace an evaluation or post-move classification;
- claim an exact human move probability from Maia's UCI rank;
- present a heuristic as a forced conclusion.
