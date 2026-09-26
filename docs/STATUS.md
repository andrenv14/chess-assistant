# Project status

Status date: 2026-09-25. Percentages describe verified scope, not elapsed time.
They are deliberately conservative: implementation without an automated test or
repeatable setup procedure does not count as complete.

## Current readiness

- local analysis core: **99%**;
- portfolio-ready release: **97%**;
- full intended product: **95%**.

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
- strict backward-pawn evidence, dominant pawn color complexes, overloaded
  defenders, queen/minor/rook-and-minor endgames and the wrong-bishop rook-pawn
  fortress motif;
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
- automated packaged-renderer captures at Windows 100% and 150% scale for all
  five portfolio views, plus a generated animated demonstration;
- automatic live-position analysis with an end-to-end mocked WebSocket UI test;
- TypeScript contracts, structured redacted logs and engineering documentation;
- local Ruff, Pytest, Vitest, typecheck and production builds;
- GitHub Actions checks for every push to `main` and every pull request,
  including a Windows job with the pinned native Stockfish regression corpus;
- self-contained Windows backend with embedded Python, opening catalogue and
  the official Stockfish binary, license and corresponding source;
- reproducible unpacked Electron and NSIS installer builds, plus a packaged
  backend smoke test and a successful real analysis launched by the final app;
- successful silent NSIS install on the development Windows host, verified
  React mount from `file://`, embedded Stockfish analysis, 3,815 openings and
  clean uninstall in an isolated data directory;
- compiled MV3 extension loaded through Chromium's official extension API and
  verified end to end for both site adapters through the real service worker,
  local WebSocket and packaged backend;
- signed-release workflow and strict Authenticode verifier ready for a real
  publisher certificate;
- original vector application icon converted by the Windows packaging pipeline;

## Required before calling it portfolio-ready

1. Expand the successful real-provider smoke test into a fixed paid regression set
   covering tactics, strategy, endgames and forced mates.
2. Repeat the successful installed-host checks in a disposable clean Windows
   VM and exercise authenticated bot, friend and matchmaking routes on both
   sites as their DOM changes over time.
3. Add attraction/deflection sequences that are proved across multiple PV plies
   and expand the native corpus with more depth-sensitive historical positions.
4. Supply a trusted Authenticode publisher certificate to the prepared release
   workflow. Local self-signing is deliberately not counted as completion.

Maia-3 is outside the critical path. It remains optional and can never change
Stockfish candidates, evaluation, rank or post-move classification.
