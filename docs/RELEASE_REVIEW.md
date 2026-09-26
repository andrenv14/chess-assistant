# Release review — 2026-09-26

This review audits behavior, interpretation, latency, frontend state, browser
integration, documentation and portfolio evidence. It distinguishes a working
portfolio release from claims that still need external production validation.

## Outcome

**Go for portfolio and local demonstration.** The app has a reproducible
Windows package, real Stockfish integration, a tested browser-to-desktop path,
and screenshots built from the production renderer. **Not yet a signed public
distribution:** clean-VM repetition, a publisher certificate and longer
authenticated site runs remain explicit follow-up work.

## Findings and corrections

| Area | Finding | Correction | Regression proof |
|---|---|---|---|
| Latency | One global lock serialized all Stockfish roles. Post-move classification could block the candidate list. | One lock per native role; advisor, opponent and evaluator now work concurrently. | Python concurrency test and real benchmark. |
| Meaning | “Opponent reply” reused the advisor's second PV move while the response model named the opponent role. | Initial candidates arrive without replies; the selected line is enriched by the independently configured opposite-side process. | Unit, API, React and native-integration tests. |
| Evaluation | The eval bar could show a limited advisor score without making that authority clear. | The quick score is labelled with its profile; the optional full-strength evaluator replaces it asynchronously. | API and React progressive-evaluation tests. |
| Black perspective | The board flipped, but the eval bar retained White at the bottom. | Eval-bar colors and side labels now follow the board orientation; scores remain explicitly White-relative. | React black-orientation regression. |
| Chess.com orientation | Analysis pages can expose `boardisflipped` on the engine panel rather than the board. | The adapter examines both signals and supports empty boolean attributes. | Extension DOM fixtures. |
| Lichess orientation | A mini board appearing before the main board could supply the wrong orientation. | Site-specific primary-board selectors are resolved before the generic fallback. | Extension DOM fixture with both boards. |
| Orientation updates | Extension de-duplication considered only FEN and source. Flipping the same position emitted nothing. | Orientation is now part of the delivery identity. | Typed implementation plus orientation suite. |
| Stale UI state | A late classification could overwrite a newer position's last-move card. | Classification results carry a local request generation and are ignored when stale; cross-source snapshots are not paired. | React integration behavior and guarded state update. |
| LLM action | The action could enter “Gerando explicação…” before confirming that the matching evidence was ready. | One shared readiness predicate gates button, shortcut and request before loading state changes. | Desktop typecheck and integration suite. |
| Repertoire recognition | Exact piece-square signatures stopped recognizing the London after `Bg3` and the Sicilian after `...cxd4 Nxd4`. | The matcher now follows stable pawn/development signatures and accepts the normal bishop retreat and central exchange. | Dedicated Python regressions for both move orders. |
| Knowledge hierarchy | Specialized opening plans were buried in the general overview while Strategy contained only generic features. | The complete repertoire course now belongs to Strategy; Overview remains a fast position diagnosis. | React topic-placement test and production-renderer capture. |
| Portfolio evidence | The previous capture set used only the initial position, which hid the repertoire and made tactics/endgame screens generic. | QA now captures a London position, a forced mate position and a rook ending from the production renderer. | `npm run qa:portfolio` at 100% and 150% scale. |
| QA reliability | Electron could keep its disposable Chromium journal open during cleanup and leave a failed capture process alive. | The capture window is always destroyed, backend shutdown is bounded and cache removal is best-effort after evidence is written. | Repeated successful portfolio runs at both Windows scales. |

## Measured latency

Measured on the development Windows host with native Stockfish 19 and the
configured 500 ms advisor/opponent limits. These numbers are observations, not
a cross-machine service-level promise.

| Visible event | Time |
|---|---:|
| Three candidates, cold advisor process | 783 ms |
| Three candidates, warm advisor process | 504 ms |
| Selected defence, first opposite-side process | 740 ms |
| Candidates while classification ran concurrently | 505 ms |
| Full post-move classification in that concurrent run | 1,926 ms |

The important UX result is the fourth row: a slower classification no longer
holds the best-move list behind it. Re-run the measurement with:

```powershell
backend\.venv\Scripts\python.exe scripts\benchmark-engine.py
```

## Verified suite

- Python fast suite: 121 passed, 8 native tests skipped by marker;
- native Stockfish 19 suite: 8 passed;
- desktop Vitest: 49 passed;
- extension Vitest: 26 passed;
- TypeScript contracts: covered by their own workspace suite and typecheck;
- Ruff, desktop/extension typechecks and production builds;
- packaged backend, installed renderer/backend and compiled-extension smoke paths;
- portfolio render at Windows 100% and 150% scale.

The repository scan found no literal OpenRouter key, and `backend/.env` is not
present in the checkout. The environment example contains placeholders only.

## Known limits kept explicit

- A site can change private DOM structure after this release; adapter fixtures
  catch known contracts but cannot guarantee future markup.
- A first snapshot taken halfway through a live game cannot reconstruct every
  historical castling fact from piece placement alone. Subsequent moves are
  legality-tracked.
- Maia-3 stays optional and outside the critical path.
- Deterministic chess themes are broad but not a substitute for a tablebase,
  a full tactical taxonomy or a large human-authored opening course.
- LLM prose requires configured provider credit; all engine and deterministic
  knowledge views remain useful without it.
- The installer is unsigned until a real Authenticode publisher certificate is supplied.

## Release gate

The portfolio package is acceptable when the full checks, native integration,
installer smoke, live-extension smoke and both portfolio scales pass against the
same commit. A signed public release additionally requires clean-VM repetition
and the publisher certificate.
