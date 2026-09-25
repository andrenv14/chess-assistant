# Deterministic position evidence

The feature extractor converts a validated FEN into structured facts for the UI
and LLM prompts. It does not call Stockfish, Maia or an external service.

## Current facts

- conventional material counts and white-minus-black balance;
- opening, middlegame or endgame phase heuristic;
- doubled, isolated and passed pawns for each side;
- king square, castled position, immediate pawn shield and nearby files without
  friendly pawns;
- check state, legal-move and capture counts, legal checking and mate-in-one moves;
- pieces absolutely pinned to their king for both colors;
- attacked non-pawn pieces with no same-color defender.

Squares and moves use algebraic/UCI notation so every claim can be traced back
to the board. The API is `POST /api/features`.

## Semantics and limitations

These are facts or explicitly named heuristics, not an evaluation:

- material values are the conventional 100/320/330/500/900 scale;
- phase uses remaining non-pawn material, original minor-piece squares and the
  FEN move counter;
- `castled_position` means the king occupies `c1/g1/c8/g8`; a FEN alone cannot
  prove that castling was the historical move;
- `open_nearby_files` currently means no friendly pawn on that file;
- an `undefended_attacked` piece has an enemy attacker and no same-color
  defender according to the static position;
- a pinned piece is an absolute pin according to legal king safety, not a
  relative pin against a queen or other valuable piece;
- `mate_in_one_moves` is proved by applying each legal move and checking the
  resulting terminal position. Longer mating sequences still require Stockfish.

The explanation layer labels heuristics as such and its schema excludes fields
that could replace engine scores or ranks. It must never turn them into claims
such as “winning”, “forced” or “best” without Stockfish evidence.
