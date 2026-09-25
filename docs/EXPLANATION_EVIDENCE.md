# Candidate evidence for explanations

`POST /api/evidence` is the canonical analysis entry point for the desktop. It
runs the configured Stockfish advisor and opponent engines, keeps the
full-strength evaluator as the objective authority, and then annotates each
candidate with deterministic move facts.

## Candidate facts

- capture and captured piece type;
- check and immediate checkmate;
- high-value pieces simultaneously attacked by the moved piece (fork targets);
- newly created absolute pins against the king;
- newly created relative pins where a front piece shields a more valuable
  non-king piece on the same sliding-piece ray;
- discovered attacks opened for another bishop, rook or queen, with the target
  square recorded explicitly;
- newly attacked enemy knights, bishops, rooks or queens without a same-color
  defender;
- castling;
- promotion;
- minor-piece development from its home square;
- occupation of `d4`, `e4`, `d5` or `e5`;
- passed-pawn advance or creation;
- immediate improvement in the king's pawn shield.

Facts become stable plan-hint identifiers such as `secure_king`, `fork_pieces`,
`pin_piece`, `relative_pin_piece`, `discovered_attack`, `deliver_checkmate` and
`advance_passed_pawn`. Portuguese labels belong to the desktop presentation
layer; the identifiers remain language-neutral for tests and provider prompts.

## Authority and non-claims

The hint `capture_or_exchange_material` means only that the candidate captures
a piece. Whether the exchange wins, loses or merely trades material must come
from the Stockfish evaluation and principal variation. Likewise,
`force_check_response` only says that the opponent must answer the check; it
does not claim that the king itself must move or that the checking move is good.

`fork_pieces` is deliberately conservative: the moved piece must attack at
least two enemy knights, bishops, rooks, queens or kings, and at least one of
those attacks must be new. `pin_piece` means an absolute pin to the king.
`relative_pin_piece` requires the shielded piece to have a strictly higher
material value, and never relabels an absolute king pin. `discovered_attack`
excludes attacks made directly by the moved piece. These facts identify
geometry; Stockfish still decides whether the tactic is sound.
`attack_loose_piece` uses the same conservative high-value piece set and does
not label an undefended pawn as a loose piece.

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

Position-level evidence also includes pawn islands, connected passers, open and
semi-open files, bishop pairs, king-zone pressure and strict endgame types. The
desktop renders these facts before an LLM response is requested, so the user can
distinguish deterministic themes from generated prose.
