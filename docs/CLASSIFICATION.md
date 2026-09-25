# Move classification

## Objective

After a position snapshot changes, the backend reconstructs the one legal move
that connects the old position to the new one. It then compares the expected
score of the evaluator's best move with the expected score after the played
move.

The full-strength Stockfish evaluator is authoritative. Advisor Elo, Maia-3 and
the LLM cannot assign or change a classification. The system uses Stockfish's
WDL model to calculate expected points from the mover's perspective:

```text
expected points = win probability + 0.5 × draw probability
loss = expected points before - expected points after
```

The public semantic reference is Chess.com's description of its
[move classifications](https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc).
Chess.com does not publish every implementation detail. This project therefore
documents its deterministic local rules instead of claiming byte-for-byte
parity with a proprietary service.

## Priority

Rules are applied in this order:

1. `book` — the resulting position is in the bundled Lichess catalogue;
2. `brilliant` — a sound and nontrivial piece sacrifice;
3. `great` — the unique strong move that preserves at least an equal result;
4. `miss` — failure to convert a concrete forcing winning opportunity;
5. the expected-points loss bands.

Every API result includes the rule used, whether the played move was Stockfish's
first choice, sacrifice/forcing flags and the second-best move with its expected
points when available. This makes the label auditable in the desktop instead of
leaving it as an unexplained icon.

## Expected-points bands

| Key | Portuguese label | Symbol | Expected-points loss |
| --- | --- | --- | --- |
| `best` | Melhor | ★ | effectively zero |
| `excellent` | Excelente | ✓ | up to 0.02 |
| `good` | Bom | 👍 | up to 0.05 |
| `inaccuracy` | Imprecisão | ?! | up to 0.10 |
| `mistake` | Erro | ? | up to 0.20 |
| `blunder` | Erro grave | ?? | above 0.20 |

An epsilon of `0.0005` absorbs floating-point noise for equivalent best moves.

## Special rules

### Book — Livro (📖)

The position after the move must match the local CC0 Lichess opening catalogue.
Clients cannot claim book status in the request.

### Brilliant — Brilhante (!!)

All conditions are required:

- the played move loses no more than `0.02` expected points;
- the move offers a knight, bishop, rook or queen that the opponent can capture;
- an immediate recapture does not restore the material, leaving at least a
  two-pawn static material concession;
- the mover retains at least `0.50` expected points after the move;
- the second engine choice is below `0.90`, preventing decorative sacrifices
  in positions where an alternative was already trivially winning.

The sacrifice detector is deliberately conservative. A static flag alone never
creates a Brilliant label: Stockfish must also validate the resulting position.

### Great — Ótimo (!)

All conditions are required:

- the played move is Stockfish's first choice;
- it retains at least `0.45` expected points;
- the second engine choice loses at least `0.10` expected points relative to
  the best line.

This captures the publicly described “only good move” case without using the
student's rating to change the result.

### Miss — Oportunidade perdida (Ø)

All conditions are required:

- Stockfish's best move is concrete: a capture, promotion or check;
- the best line offered at least `0.65` expected points;
- the played move leaves at most `0.55` expected points;
- the loss is at least `0.10` expected points.

The rule intentionally does not label every positional deterioration as a Miss;
there must be a concrete forcing opportunity that can be shown to the user.

## Stability and depth

The evaluator requests two principal variations before a classification so it
can compare the best and second-best choices. Deeper settings can still change
an engine evaluation and therefore a label, just as deeper analysis can change
other engine-backed review systems.

The native regression corpus is stored in
`backend/tests/fixtures/classification_corpus.json`. It replays SAN moves from
their initial position instead of trusting hand-written FEN strings. Every case
records its public game source and runs with the bundled Stockfish 19 at depth
16, one thread and 64 MB of hash. A fresh engine process isolates every case
from transposition-table state.

The initial corpus deliberately distinguishes four situations:

- Réti-Tartakower's forcing queen sacrifice, which must be `brilliant`;
- Lasker-Bauer's double-bishop combination, which must be `brilliant` at the
  pinned corpus depth;
- Colle-O'Hanlon's playable bishop sacrifice, which must not be promoted merely
  because the static sacrifice detector recognizes it;
- a Greek-gift illustration where several moves are already trivially winning,
  which must stay `best` rather than become a decorative `brilliant`.

These integration checks complement the fast tests for thresholds, rule
priority, mover perspective and synthetic material-sacrifice fixtures. Run the
corpus with:

```powershell
$env:STOCKFISH_PATH = "C:\caminho\para\stockfish.exe"
cd backend
.venv\Scripts\python.exe -m pytest tests/test_classification_corpus.py
```
