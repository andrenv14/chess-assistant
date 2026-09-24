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
                                             └─ external LLM API (planned)
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
- serialize access to an engine process;
- validate all FENs and legal transitions;
- produce objective and limited-strength analysis;
- classify moves from consecutive snapshots;
- build evidence for explanations;
- redact secrets and complete game state from default logs.

### Desktop app

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

## Current scope

The current milestone has a working analysis API, runtime Stockfish profiles,
snapshot transport, base move classification, offline opening lookup, position
and candidate evidence, and an optional Maia-3 UCI boundary. Schema-validated
LLM explanations and production-grade site adapters remain planned.
