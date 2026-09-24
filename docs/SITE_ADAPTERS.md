# Site adapters

The browser extension supports only Lichess Analysis and Chess.com Analysis.
It reads an already rendered position and sends a complete FEN snapshot to the
local backend. It does not infer pointer gestures or run chess analysis.

## Lichess Analysis

Verified against the public analysis page on 2026-09-24. The current page keeps
the live FEN in an `input.copyable` under `.analyse__underboard`. The adapter
prefers that site-specific path and retains a strictly validated fallback for
minor markup changes.

Lichess changes the input's JavaScript `value` property after a move. The bridge
therefore combines:

- DOM mutation observation for immediate updates;
- captured `input` and `popstate` events;
- a 500 ms poll as a fallback for property-only updates;
- FEN de-duplication before sending an event.

The polling loop is stopped and the observer detached on `pagehide`.
The manifest pattern includes both `/analysis` and deeper analysis URLs.

## Chess.com Analysis

The initial loader exposes a textarea labelled “Paste a PGN, FEN, or study
link…”, which the adapter can read when it contains a complete FEN. After the
analysis loads, the engine-lines component exposes the complete live position in
a `fen` attribute under `#board-layout-analysis`. This was verified on the public
analysis page on 2026-09-24, including the side to move, castling rights, en
passant square and move counters after a move.

The adapter reads that attribute directly and validates the complete value. It
does not rebuild the position from piece CSS classes, screen coordinates or
pointer movement.

## Tests and maintenance

Fixtures reproduce only the smallest relevant DOM fragment and contain no user
or game data. A site adapter is stable only after tests cover initial position,
move updates, orientation independence and any special state it derives.
