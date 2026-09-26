# Project status

Status date: 2026-09-26. Percentages describe verified scope, not elapsed time.
They are deliberately conservative: implementation without an automated test or
repeatable setup procedure does not count as complete.

## Current readiness

- verified local product scope: **100%**;
- portfolio case: **100%**;
- clean unsigned Windows release engineering: **100%**;
- signed public distribution: **external gate, not a code-completeness percentage**.

The 100% scope means the repository implements, tests, documents and packages
the complete local assistant described in this project. Clean-machine build,
installation, native analysis, browser-extension transport and uninstall are
enforced in an ephemeral Windows CI runner. Commercial code signing remains a
publisher-identity purchase and cannot be completed honestly by adding more
application code.

## Verified today

- three independently configurable Stockfish roles and real Stockfish 19 tests;
- eval bar data, candidates, principal variations and independently profiled opponent replies;
- progressive analysis: the initial MultiPV request returns candidates without
  waiting for secondary engines, the selected defence uses the other side's
  configured Stockfish, and the optional full-strength evaluator updates the
  bar in the background;
- per-role engine queues: the advisor, opponent and evaluator remain serialized
  individually but no longer block one another globally;
- measured on the development host with 500 ms profiles: 783 ms cold and 504 ms
  warm to three candidates, 740 ms for the first independently profiled defence,
  and 505 ms to candidates while a 1.93 s post-move classification ran concurrently;
- reconstruction and base classification of the played move;
- deterministic Brilliant, Great and Miss rules with sacrifice, forcing-line
  and unique-second-choice evidence returned to the desktop;
- fixed Stockfish 19 classification corpus covering the Réti–Tartakower,
  Lasker–Bauer, Colle–O'Hanlon, Opera and Evergreen combinations, plus synthetic
  unique-defence and missed-mate controls;
- multi-ply attraction and deflection evidence proved by legal principal
  variations, with target squares and truncated-line false-positive guards;
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
  order enforcement (`google/gemini-3.1-flash-lite`);
- fixed paid-provider regression matrix covering a forced mate, London
  strategy, a rook ending and the Black side of the `...e6` Sicilian; all four
  real responses passed chess-fixture and humanized-output validation;
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
- three-column initial workspace dedicated to the SVG board, Stockfish's best
  moves/lines/centipawns, and immediately available deterministic knowledge;
- automatic board orientation and advisor-role selection from the browser,
  including Chess.com engine-panel flip signals, orientation-only updates, an
  eval bar that flips with the board and negative centipawns presented explicitly
  as a Black advantage;
- focused London, `...c5/...e6` Sicilian (Kan/Taimanov), and King's Indian
  repertoire knowledge with plans for both sides, tactical themes, cautions and
  model lines;
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
- clean ephemeral Windows CI that builds the installer, runs the packaged
  backend, silently installs it, performs real native analysis, checks the
  React renderer and opening catalogue, uninstalls it and then verifies the
  compiled extension path for both supported sites;
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

## External lifecycle work after 100%

1. Supply a trusted Authenticode publisher certificate when the project is to
   be distributed publicly under a verified publisher identity. The workflow
   and strict signature verifier are already prepared.
2. Keep the Chess.com and Lichess adapters maintained when either third party
   changes private DOM markup. This is ongoing compatibility work, not missing
   functionality in the current supported contracts.
3. Optionally experiment with Maia-3 as an additional human-move comparison.
   It remains outside the critical path and can never change Stockfish
   candidates, evaluation, rank or post-move classification.
