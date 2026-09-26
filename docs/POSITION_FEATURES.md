# Deterministic position evidence

The feature extractor converts a validated FEN into structured facts for the UI
and LLM prompts. It does not call Stockfish, Maia or an external service.

## Current facts

- conventional material counts and white-minus-black balance;
- opening, middlegame or endgame phase heuristic;
- doubled, isolated, backward, passed and connected pawns for each side,
  including pawn island count and connected passers;
- open files and semi-open files for each side;
- bishop-pair possession;
- dominant light/dark pawn color complex;
- king square, castled position, immediate pawn shield, nearby files without a
  friendly pawn, attacked king-zone squares and the enemy attackers involved;
- strict king-and-pawn, pure-rook, queen, minor-piece, rook-and-minor,
  same-colored-bishop and opposite-colored-bishop endgame flags;
- the lone rook-pawn plus wrong bishop fortress motif;
- direct opposition holder when the kings face each other with one square
  between them;
- check state, legal-move and capture counts, legal checking and mate-in-one moves;
- pieces absolutely pinned to their king for both colors;
- attacked non-pawn pieces with no same-color defender;
- pieces that are the sole defender of two attacked non-pawn assets.

Squares and moves use algebraic/UCI notation so every claim can be traced back
to the board. The API is `POST /api/features`.

## Semantics and limitations

These are facts or explicitly named heuristics, not an evaluation:

- material values are the conventional 100/320/330/500/900 scale;
- phase uses remaining non-pawn material, original minor-piece squares and the
  FEN move counter;
- `castled_position` means the king occupies `c1/g1/c8/g8`; a FEN alone cannot
  prove that castling was the historical move;
- `files_without_friendly_pawn` includes both fully open and semi-open files in
  the three-file zone around the king;
- connected pawns occupy adjacent files and differ by no more than one rank;
- a backward pawn has a friendly adjacent pawn farther advanced, cannot have
  its advance square protected by another friendly pawn and faces enemy pawn
  control on that square;
- pawn islands are contiguous groups of files containing friendly pawns;
- an open file has no pawn of either color; a semi-open file has no pawn for
  the named side and at least one enemy pawn;
- king-zone attackers are geometric attackers of the king square or one of its
  adjacent squares; this is pressure evidence, not a claim of a sound attack;
- `king_and_pawn_endgame` requires at least one pawn and no non-pawn material;
  `pure_rook_endgame` requires exactly one rook per side and no queens, bishops
  or knights; bishop-endgame flags likewise require exactly one bishop per side
  and no other non-pawn material;
- direct opposition is assigned to the side not to move only when the kings
  share a rank or file with exactly one square between them;
- an `undefended_attacked` piece has an enemy attacker and no same-color
  defender according to the static position;
- a pinned piece is an absolute pin according to legal king safety, not a
  relative pin against a queen or other valuable piece;
- an overloaded piece must be the only non-king defender of at least two
  currently attacked non-pawn assets;
- `mate_in_one_moves` is proved by applying each legal move and checking the
  resulting terminal position. Longer mating sequences still require Stockfish.

The explanation layer labels heuristics as such and its schema excludes fields
that could replace engine scores or ranks. It must never turn them into claims
such as “winning”, “forced” or “best” without Stockfish evidence.
