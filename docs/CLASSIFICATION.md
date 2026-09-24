# Move classification

## Objective

After a position snapshot changes, the backend reconstructs the one legal move
that connects the old position to the new one. It then compares the expected
score of the evaluator's best move with the expected score after the played move.

The full-strength Stockfish evaluator is authoritative. The system uses its WDL
model to calculate expected points from the mover's perspective:

```text
expected points = win probability + 0.5 × draw probability
loss = expected points before - expected points after
```

## Base cutoffs

The first implementation follows the publicly documented Classification V2
expected-points intervals:

| Key | Portuguese label | Symbol | Expected-points loss |
| --- | --- | --- | --- |
| `book` | Livro | 📖 | opening source overrides base class |
| `best` | Melhor | ★ | effectively zero |
| `excellent` | Excelente | ✓ | up to 0.02 |
| `good` | Bom | ○ | up to 0.05 |
| `inaccuracy` | Imprecisão | ?! | up to 0.10 |
| `mistake` | Erro | ? | up to 0.20 |
| `blunder` | Erro grave | ?? | above 0.20 |

An epsilon of `0.0005` absorbs floating-point noise for equivalent best moves.

## Planned special classifications

The following require evidence beyond expected-points loss and are not yet
implemented:

- `Brilliant (!!)`: best or nearly best good sacrifice, without leaving a bad
  position and without being irrelevant in an already trivial win;
- `Great (!)`: a critical or uniquely strong move that preserves or changes the
  expected result;
- `Miss (×)`: failure to exploit an opponent error and a lost winning chance;
- `Book (📖)`: automatic recognition from ECO/Lichess opening data. The API
  already accepts an `is_book` flag, but the opening provider is still planned.

Every special rule must be implemented as deterministic code with named fixture
positions. The LLM may explain a classification but cannot assign or change it.
