# Chess knowledge layer

Stockfish remains the authority for move quality and numerical evaluation. The
knowledge layer names auditable chess facts so the interface and the LLM can
explain *why* a candidate works without inventing a story from an engine score.

## Position concepts

The deterministic extractor currently reports:

- material balance and game phase;
- doubled, isolated, connected and passed pawns, including connected passers;
- pawn islands and wing majorities;
- open and semi-open files;
- bishop pair and restricted bad bishops;
- pawn-supported outposts and occupied knight outposts;
- pawn-controlled weak squares in each side's central territory;
- safe pawn-controlled space in the opponent half;
- rooks on open/semi-open files and on the seventh rank;
- king pawn shield, open king files and enemy pressure in the king zone;
- strict king-and-pawn, rook and same/opposite-colored bishop endgames;
- direct opposition;
- checks, mate in one, absolute pins and attacked undefended pieces.

## Candidate-move concepts

Every Stockfish candidate is replayed legally and compared with the original
position. The resulting facts include:

- check, mate, capture, promotion and castling;
- forks, absolute and relative pins, discovered attacks and loose-piece attacks;
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
