# Site adapters

The browser extension supports Lichess and Chess.com analysis pages plus their
playable game boards. This includes computer games, friend games and matchmaking
pages when they use the sites' standard board renderers. It reads the rendered
position and sends a complete FEN snapshot to the local backend. It does not
infer pointer gestures or run chess analysis.

The manifest runs the small content reader across both site origins because
both applications navigate between lobby, game and analysis screens without a
full page load. Route guards keep the reader inactive outside supported board
pages; the only network permission is the loopback backend at
`127.0.0.1:8765`.

## Lichess Analysis

Verified against the public analysis page on 2026-09-25. The current page keeps
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
The route recognizer includes both `/analysis` and deeper analysis URLs.

The background bridge keeps only the newest position queued while disconnected.
It clears that position only after the backend acknowledgement and replays an
unacknowledged position after reconnecting, so a backend startup race cannot
silently lose the board snapshot.

## Chess.com Analysis

The initial loader exposes an input labelled “Paste a PGN, FEN, or study link…”,
which the adapter can read when it contains a complete FEN. After the analysis
and engine panel load asynchronously, the
`.engine-lines-engine-lines-redesign` component exposes the complete live
position in a `fen` attribute. This was verified on the public analysis page on
2026-09-25 by playing `1.e4`: the resulting value included Black to move,
castling rights, `e3` as the en passant target, and both move counters.

The adapter reads that attribute directly and validates the complete value. The
`fen` value stays independent from board orientation; the fixture includes the
separate `boardisflipped` attribute to guard that boundary.

## Live games

Playable pages do not consistently expose a complete FEN. The live reader uses
two site-specific representations verified on 2026-09-25:

- Chess.com `wc-chess-board` pieces, whose classes contain a color/type token
  and a logical `square-XY` coordinate;
- Lichess `cg-board` pieces, whose class names contain color/type and whose CSS
  transforms are converted through the board size and orientation.

The resulting placement is not trusted blindly. A stateful `chess.js` tracker
matches it against every legal successor of the last accepted FEN. That keeps
side to move, castling rights, en-passant state and move counters consistent.
When the extension joins an existing game or reloads midgame, it infers a
conservative initial FEN from the last-move highlights and home king/rook
placement. A non-starting placement must be identical in two observations
before it is accepted, which filters half-rendered animation frames.

Supported route families currently include:

- Chess.com `/play/*` and `/game/*`;
- Lichess game IDs, `/tv/*` and `/practice/*`;
- both sites' analysis pages.

The reader targets standard chess. Variant-specific castling rules are outside
the current contract.

## Tests and maintenance

Fixtures reproduce only the smallest relevant DOM fragment and contain no user
or game data. Tests cover initial position, a legal live transition, joining a
game after a move, orientation independence, route guards, backend forwarding
and animation-state stabilization.
