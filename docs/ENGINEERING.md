# Engineering standards

## Definition of done

A change is complete only when its implementation, tests, logs and documentation
land together. Required checks are:

```powershell
npm run typecheck
npm test
npm run build
npm run smoke:desktop-backend

cd backend
.venv\Scripts\python.exe -m ruff check app tests scripts
.venv\Scripts\python.exe -m pytest
```

The GitHub Actions workflow repeats the TypeScript and fast Python checks on
every push to `main` and on every pull request. It uses read-only repository
permissions, cancels superseded runs and enforces bounded timeouts. A Windows
job installs pinned Stockfish 19 and runs the native corpus. Pushes to `main`
also build the installer on a fresh hosted Windows VM, install it into an
isolated directory, analyze with the embedded engine, uninstall it and exercise
the compiled extension through its real service worker and local WebSocket.

The desktop/backend smoke test compiles the Electron main process, launches the
real local Python service, requires the application-specific health identity and
working temporary SQLite storage, verifies extension-to-desktop WebSocket
forwarding plus acknowledgement, and then stops only the process it created.

Host-dependent latency can be audited separately with the real configured
engine. The benchmark reports cold and warm candidate time, selected-defence
time and time-to-candidates while classification is running:

```powershell
backend\.venv\Scripts\python.exe scripts\benchmark-engine.py
```

It emits JSON, does not read the LLM credential and is evidence for comparison,
not a hardware-independent performance promise.

The fixed four-position LLM matrix can validate its chess fixtures without
provider spend, or run the paid structured-output calls when credentials are
present:

```powershell
cd backend
.venv\Scripts\python.exe scripts\regression_llm.py --dry-run
.venv\Scripts\python.exe scripts\regression_llm.py
```

The manual `Paid LLM regression` workflow runs the same matrix using the
`OPENROUTER_API_KEY` repository secret. It emits acceptance metadata rather
than prompts or prose.

## Testing strategy

- Pytest covers models, chess rules, expected-points and evidence-backed special
  classifications, APIs, WebSockets and UCI
  adapters.
- Vitest covers TypeScript transformations, presentation rules, the React
  profile/history integration surface, extension extraction and popup behavior.
- Real-engine tests will be marked separately so the fast suite does not depend
  on a locally installed binary. Set `STOCKFISH_PATH` and run
  `pytest -m integration` to exercise native UCI processes.
- Regression tests use named FEN fixtures and state whose perspective each
  expected evaluation uses.
- Browser adapters require captured, sanitized DOM fixtures for both supported
  platforms before they are considered stable.

Tests should assert behavior, not private implementation details.

## Logging

Backend logs are JSON and use stable event names. Complete FENs, games, prompts,
API keys and authorization headers are excluded by default. A short SHA-256
position identifier allows correlation without storing the position itself.

Recommended levels:

- `debug`: protocol details useful only during development;
- `info`: engine lifecycle, completed analysis and configuration changes;
- `warning`: recoverable parser, connection or provider failures;
- `error`: requests that cannot be completed;
- `critical`: corrupted state or repeated engine startup failure.

## Comments and documentation

- Comments explain intent, invariants and non-obvious tradeoffs.
- Public Python modules and complex chess calculations use docstrings.
- TypeScript public contracts use explicit types rather than prose comments.
- Architectural decisions that affect more than one component belong in `docs/`.
- README instructions must remain executable on a clean Windows checkout.

## Security and privacy

- Bind services to `127.0.0.1` by default.
- Never log secrets.
- Treat browser messages and LLM output as untrusted input.
- Validate FEN, UCI moves and structured model responses at component boundaries.
