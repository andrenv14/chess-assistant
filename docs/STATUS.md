# Project status

Status date: 2026-09-24. Percentages describe verified scope, not elapsed time.
They are deliberately conservative: implementation without an automated test or
repeatable setup procedure does not count as complete.

## Current readiness

- local analysis core: **78%**;
- portfolio-ready release: **55%**;
- full intended product: **58%**.

The core percentage is higher because native Stockfish analysis, independent
runtime profiles, move classification, opening lookup, deterministic evidence,
the desktop API and both analysis-page readers work. Release readiness is lower
because the user still starts multiple processes manually and loads an unpacked
extension.

## Verified today

- three independently configurable Stockfish roles and real Stockfish 19 tests;
- eval bar data, candidates, principal variations and opponent replies;
- reconstruction and base classification of the played move;
- 3,815 local Lichess opening positions;
- deterministic position and candidate facts;
- schema-validated OpenAI Responses transport with Stockfish order enforcement;
- current Lichess Analysis and Chess.com Analysis FEN extraction;
- TypeScript contracts, structured redacted logs and engineering documentation;
- local Ruff, Pytest, Vitest, typecheck and production builds;
- GitHub Actions checks for every push to `main` and every pull request.

## Required before calling it portfolio-ready

1. Run a real LLM request with a user-provided key and evaluate explanation
   quality on a fixed position set.
2. Exercise the built extension and desktop app together in installed form on
   both supported analysis pages.
3. Expand move labels beyond the current objective loss bands where evidence
   can support labels such as brilliant, great or missed opportunity.
4. Add richer tactical motifs, strategic structures, endgame concepts and
   king-safety explanations with regression fixtures.
5. Persist settings and analysis history.
6. Package the desktop, backend and licensed Stockfish distribution into a
   repeatable Windows installation and test it on a clean machine.
7. Add UI-level regression tests and a short portfolio demo flow.

Maia-3 is outside the critical path. It remains optional and can never change
Stockfish candidates, evaluation, rank or post-move classification.
