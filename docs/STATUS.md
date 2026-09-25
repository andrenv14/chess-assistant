# Project status

Status date: 2026-09-25. Percentages describe verified scope, not elapsed time.
They are deliberately conservative: implementation without an automated test or
repeatable setup procedure does not count as complete.

## Current readiness

- local analysis core: **93%**;
- portfolio-ready release: **80%**;
- full intended product: **79%**.

The core percentage is higher because native Stockfish analysis, independent
runtime profiles, move classification, opening lookup, deterministic evidence,
the desktop API and both analysis-page readers work. Release readiness is lower
because the Windows installer has not yet been exercised on a clean machine and
the extension is still loaded unpacked.

## Verified today

- three independently configurable Stockfish roles and real Stockfish 19 tests;
- eval bar data, candidates, principal variations and opponent replies;
- reconstruction and base classification of the played move;
- 3,815 local Lichess opening positions;
- deterministic position and candidate facts;
- deterministic mate-in-one, fork, absolute-pin and loose-piece motifs with
  concrete target squares in the desktop;
- deterministic pawn islands, connected passers, file structure, bishop pairs,
  king-zone pressure, strict endgame types and direct opposition;
- SQLite persistence for runtime profiles and bounded recent analysis history,
  with restore and clear controls in the desktop;
- Electron-owned backend startup, identity health check and bounded shutdown,
  verified by a reproducible real-process smoke test;
- real extension-to-desktop WebSocket forwarding with backend acknowledgement,
  plus latest-position queuing and replay after reconnect;
- live OpenRouter/OpenResponses request with structured-output and Stockfish
  order enforcement (`google/gemini-3.8-flash`);
- live 2026-09-25 Lichess and Chess.com Analysis FEN extraction, including an
  `1.e4` update with full turn, castling, en passant and move-counter state;
- live local renderer verification of native Stockfish analysis, runtime Elo
  update, persistence after reload and deterministic history restoration;
- React UI regression coverage for persisted profiles and history restoration,
  plus extension popup validation and delivery states;
- TypeScript contracts, structured redacted logs and engineering documentation;
- local Ruff, Pytest, Vitest, typecheck and production builds;
- GitHub Actions checks for every push to `main` and every pull request.
- self-contained Windows backend with embedded Python, opening catalogue and
  the official Stockfish binary, license and corresponding source;
- reproducible unpacked Electron and NSIS installer builds, plus a packaged
  backend smoke test and a successful real analysis launched by the final app;

## Required before calling it portfolio-ready

1. Expand the successful real-provider smoke test into a fixed regression set
   covering tactics, strategy, endgames and forced mates.
2. Exercise the built extension and desktop app together in installed form on
   both supported analysis pages.
3. Expand move labels beyond the current objective loss bands where evidence
   can support labels such as brilliant, great or missed opportunity.
4. Expand beyond the current tactical/strategic base into discovered attacks,
   relative pins, weak squares, outposts and more specialized endgame concepts.
5. Exercise the generated Windows installer on a clean machine, add a release
   icon and trusted code signing, and document upgrade/uninstall behavior.
6. Expand UI-level regression coverage beyond profiles/history and add a short
   portfolio demo flow.

Maia-3 is outside the critical path. It remains optional and can never change
Stockfish candidates, evaluation, rank or post-move classification.
