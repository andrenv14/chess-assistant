# Architecture

## Design goals

Chess Assistant is a local-first application. Browser integrations only collect
the current chess state; every engine, rule, explanation request and user-facing
decision is coordinated on the user's computer.

The core is deliberately independent from page markup:

```text
Chess.com adapter ─┐
                   ├─ BoardSnapshot ─ WebSocket ─ Python backend
Lichess adapter ───┘                         │
                                             ├─ Stockfish advisor
                                             ├─ Stockfish opponent
                                             ├─ Stockfish evaluator
                                             ├─ Maia-3 adapter (optional)
                                             ├─ opening/feature analysis
                                             └─ external LLM API
                                                        │
                                                        ▼
                                                Electron desktop app
```

## Responsibilities

### Browser extension

- implement exactly two adapters: Chess.com and Lichess;
- normalize page state into versioned contracts;
- publish position snapshots only when they change;
- never run a chess engine or call an LLM;
- never infer a move from pointer gestures.

### Python backend

- own every native engine process;
- serialize access to each engine process while allowing different roles to run concurrently;
- validate all FENs and legal transitions;
- produce objective and limited-strength analysis;
- classify moves from consecutive snapshots;
- build evidence for explanations;
- persist engine profiles and bounded deterministic history in local SQLite;
- redact secrets and complete game state from default logs.

### Desktop app

- start and health-check the Python backend when no verified instance exists;
- stop only a backend process owned by this Electron session;
- present engine output without changing its meaning;
- allow runtime configuration of each engine role;
- show pre-move options and post-move classification separately;
- reconnect to the local backend without losing user settings.

## Engine authority

1. The full-strength Stockfish evaluator is the objective authority.
2. Limited Stockfish instances generate configurable suggestions and replies.
3. Maia-3 may separately rank plausible human choices and estimate human-game
   outcomes; it cannot alter Stockfish candidates or objective evaluation.
4. Deterministic extractors identify chess facts and themes.
5. The LLM verbalizes supplied evidence and cannot override it.

## Progressive analysis path

The latency-sensitive desktop request does not wait for every optional engine:

1. the advisor runs one MultiPV search and returns candidates plus deterministic evidence;
2. the selected candidate is sent to the separately configured opposite-side
   engine, so its defence is not mislabelled as another profile's result;
3. the full-strength evaluator updates the eval bar in the background;
4. post-move classification uses the evaluator's own queue and therefore does
   not block the advisor.

Each role owns one native process and one lock. This preserves UCI process
safety without recreating the former global queue between unrelated engines.

## Current scope

The current milestone has a working analysis API, runtime Stockfish profiles,
snapshot transport, base move classification, offline opening lookup, position
and candidate evidence, a schema-validated LLM explanation boundary, and an
optional Maia-3 UCI adapter. The OpenRouter/OpenResponses transport has passed a
live end-to-end test with native Stockfish evidence and a structured Gemini 3.1
Flash Lite response. Engine profiles and recent deterministic analyses now survive a
backend restart through a bounded local SQLite store.
The analysis and playable-board adapters have been verified against current
public Lichess and Chess.com markup. They prefer complete FEN values and use a
legality-tracked DOM reconstruction when a live board exposes pieces only.
The packaged backend, NSIS install/uninstall path and a compiled-extension
loopback flow are covered by repeatable host-side QA. A disposable clean-VM
pass and Authenticode publisher certificate remain release-distribution work.
