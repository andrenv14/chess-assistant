# Windows packaging

The Windows release is assembled in two layers so the installed application
does not require a global Python, Node.js or Stockfish installation.

1. PyInstaller creates a one-directory backend executable containing the
   Python runtime, API dependencies and the local opening catalogue.
2. Electron Builder places that backend beside the packaged Electron resources
   and creates a per-user NSIS installer.

The desktop process prefers the packaged `chess-assistant-backend.exe`. A
Python/uvicorn launch remains the development fallback, and
`CHESS_ASSISTANT_PYTHON` can still force a diagnostic runtime.

## Prerequisites

- Node.js 22 or newer;
- the repository's `backend/.venv` created with Python 3.11 or newer;
- packaging dependencies installed with
  `backend\.venv\Scripts\python.exe -m pip install -e ".\backend[package]"`;
- JavaScript dependencies installed with `npm install`;
- the verified official Stockfish package installed by
  `scripts\install-stockfish.ps1`.

The packaging script refuses to continue unless the Stockfish executable,
GPLv3 license and corresponding source tree are all present. The local Lichess
opening catalogue and its CC0 notice are included with the backend resources.

## Commands

Create an unpacked application directory for fast verification:

```powershell
npm run package:dir
```

Verify the packaged backend, embedded engine and opening catalogue:

```powershell
npm run smoke:packaged-backend
```

Create the Windows installer:

```powershell
npm run package:win
```

Artifacts are written below `apps/desktop/release` and are ignored by Git.
Release artifacts must not contain `.env`, the local SQLite database or API
keys. User data continues to live under `%LOCALAPPDATA%\ChessAssistant`.
Current local artifacts are not code-signed with a trusted publisher
certificate, so Windows SmartScreen may warn until release signing is added.

## Verification checklist

Before publishing an installer:

1. install it on a clean Windows user or disposable VM;
2. confirm `/health` reports the packaged Stockfish and 3,815 opening entries;
3. analyze a position, change both advisor strengths and restart the app;
4. confirm analysis history and strength profiles persist;
5. load the extension separately and verify Lichess and Chess.com Analysis;
6. uninstall the desktop app and confirm user data behavior is documented for
   that release.

The browser extension remains a separate unpacked artifact in this milestone;
loading or publishing it is intentionally not hidden inside the desktop
installer.
