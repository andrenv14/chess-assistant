# Project status

Status date: 2026-09-25. Percentages describe verified scope, not elapsed time.
They are deliberately conservative: implementation without an automated test or
repeatable setup procedure does not count as complete.

## Current readiness

- local analysis core: **98%**;
- portfolio-ready release: **94%**;
- full intended product: **93%**.

The core percentage is higher because native Stockfish analysis, independent
runtime profiles, move classification, opening lookup, deterministic evidence,
the desktop API and both analysis/live-game readers work. Release readiness is lower
because the Windows installer has not yet been exercised on a clean machine and
the extension is still loaded unpacked.

## Verified today

- three independently configurable Stockfish roles and real Stockfish 19 tests;
- eval bar data, candidates, principal variations and opponent replies;
- reconstruction and base classification of the played move;
- deterministic Brilliant, Great and Miss rules with sacrifice, forcing-line
  and unique-second-choice evidence returned to the desktop;
- fixed Stockfish 19 classification corpus covering two celebrated sacrifices,
  a sound non-best sacrifice and a decorative-sacrifice false-positive guard;
- 3,815 local Lichess opening positions;
- deterministic position and candidate facts;
- deterministic mate-in-one, fork, absolute-pin and loose-piece motifs with
  concrete target squares in the desktop;
- deterministic relative-pin and discovered-attack motifs with concrete target
  squares in the desktop;
- deterministic pawn islands, connected passers, file structure, bishop pairs,
  king-zone pressure, strict endgame types and direct opposition;
- deterministic weak squares, stable and occupied outposts, pawn-controlled
  space, wing majorities, restricted bishops, open-file rooks and seventh-rank
  rooks;
- candidate evidence for pawn breaks, outpost creation/occupation, rook
  activation, space gain, restricted-piece improvement, endgame king
  centralization, defender removal, line interference and connected rooks;
- SQLite persistence for runtime profiles and bounded recent analysis history,
  with restore and clear controls in the desktop;
- Electron-owned backend startup, identity health check and bounded shutdown,
  verified by a reproducible real-process smoke test;
- real extension-to-desktop WebSocket forwarding with backend acknowledgement,
  plus latest-position queuing and replay after reconnect;
- live OpenRouter/OpenResponses request with structured-output and Stockfish
  order enforcement (`google/gemini-3.8-flash`);
- evidence-cited LLM output: position and candidate prose must reference a
  server-built grounding catalogue, and the named critical reply must match the
  strongest configured Stockfish response; the compact grounded prompt passed
  a live three-candidate OpenRouter run with 1,868 input and 1,441 output tokens;
- live 2026-09-25 Lichess and Chess.com Analysis FEN extraction, including an
  `1.e4` update with full turn, castling, en passant and move-counter state;
- live 2026-09-25 inspection of Chess.com `wc-chess-board` and Lichess
  `cg-board`, with legality-tracked FEN reconstruction for `/play/*`, `/game/*`,
  Lichess game IDs, `/tv/*` and `/practice/*`;
- animation-frame stabilization, midgame-join inference, black-orientation and
  live-source forwarding tests;
- live local renderer verification of native Stockfish analysis, runtime Elo
  update, persistence after reload and deterministic history restoration;
- React UI regression coverage for persisted profiles and history restoration,
  plus extension popup validation and delivery states;
- responsive analysis cockpit with a FEN board, candidate arrows, move
  selection, progressive engine controls, keyboard shortcuts and reduced-motion
  support;
- interactive principal-variation explorer that advances the real board state
  one ply at a time by click or keyboard, with candidate score-gap comparison;
- multi-page React experience separating the analysis cockpit from a dedicated
  knowledge center, with interactive panorama, tactics, strategy and endgame
  views around a persistent board;
- explainable white/black indicators for development, king safety and pawn
  health, visually and contractually separated from the Stockfish evaluation;
- browser QA at desktop and tablet widths for the analysis cockpit and PV
  navigation;
- automatic live-position analysis with an end-to-end mocked WebSocket UI test;
- TypeScript contracts, structured redacted logs and engineering documentation;
- local Ruff, Pytest, Vitest, typecheck and production builds;
- GitHub Actions checks for every push to `main` and every pull request,
  including a Windows job with the pinned native Stockfish regression corpus;
- self-contained Windows backend with embedded Python, opening catalogue and
  the official Stockfish binary, license and corresponding source;
- reproducible unpacked Electron and NSIS installer builds, plus a packaged
  backend smoke test and a successful real analysis launched by the final app;
- original vector application icon converted by the Windows packaging pipeline;

## Required before calling it portfolio-ready

1. Expand the successful real-provider smoke test into a fixed regression set
   covering tactics, strategy, endgames and forced mates.
2. Exercise the built extension and desktop app together in installed form on
   analysis, bot, friend and matchmaking pages on both sites, plus 100%/150%
   Windows display scaling.
3. Expand the fixed native-Stockfish classification corpus with more defensive
   only-move, missed-win and depth-sensitive positions.
4. Expand the new high-level layer into backward pawns, color-complex strategy,
   overloaded pieces, attraction/deflection sequences and more specialized
   theoretical endgames.
5. Exercise the generated Windows installer on a clean machine and add trusted
   code signing.
6. Add a short scripted portfolio demo and screenshot set from an installed
   build.

Maia-3 is outside the critical path. It remains optional and can never change
Stockfish candidates, evaluation, rank or post-move classification.
