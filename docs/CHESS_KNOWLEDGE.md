# Chess knowledge layer

Stockfish remains the authority for move quality and numerical evaluation. The
knowledge layer names auditable chess facts so the interface and the LLM can
explain *why* a candidate works without inventing a story from an engine score.

## Position concepts

The deterministic extractor currently reports:

- material balance and game phase;
- doubled, isolated, backward, connected and passed pawns, including connected passers;
- pawn islands and wing majorities;
- dominant light/dark pawn color complexes;
- open and semi-open files;
- bishop pair and restricted bad bishops;
- pawn-supported outposts and occupied knight outposts;
- pawn-controlled weak squares in each side's central territory;
- safe pawn-controlled space in the opponent half;
- rooks on open/semi-open files and on the seventh rank;
- king pawn shield, open king files and enemy pressure in the king zone;
- strict king-and-pawn, rook, queen, minor-piece, rook-and-minor and
  same/opposite-colored bishop endgames;
- the strict wrong-bishop-and-rook-pawn fortress motif;
- direct opposition;
- checks, mate in one, absolute pins, attacked undefended pieces and pieces
  overloaded as the sole defender of two attacked assets.

## Candidate-move concepts

Every Stockfish candidate is replayed legally and compared with the original
position. The resulting facts include:

- check, mate, capture, promotion and castling;
- forks, absolute and relative pins, discovered attacks and loose-piece attacks;
- attraction and deflection only when three legal principal-variation plies
  show the forcing move, displacement and immediate tactical exploitation;
- passed-pawn creation/advance and pawn-shield improvement;
- outpost creation/occupation;
- rook activation on an open file or seventh rank;
- pawn breaks and measurable space gains;
- mobility improvement for a previously restricted piece;
- king centralization in an endgame;
- removal of the sole defender of an attacked target;
- interference with a sliding attack;
- connection of the rooks.

These labels are evidence, not independent recommendations. A theme is shown
only for a candidate already supplied by Stockfish, and it never changes the
engine ranking. The structured evidence is also passed to the explanation API,
whose response is schema-validated before display.

## Accuracy boundaries

High-level terms are deliberately defined narrowly. For example, an outpost
must be supported by a friendly pawn and immune to enemy pawn attacks; a
defender-removal label requires the captured piece to have been the last enemy
defender of a target that remains attacked. Narrow rules produce fewer labels
than prose-first heuristics, but make each displayed claim testable.

Attraction and deflection are intentionally sequence-based exceptions to the
single-move rules. A truncated line never receives either label. Attraction
requires the opponent to take the offered piece on its destination and the next
move to exploit the attracted piece; deflection requires a displaced defender
to abandon the exact target captured on the next ply.
