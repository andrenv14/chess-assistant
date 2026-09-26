# Windows packaging

The Windows release is assembled in two layers so the installed application
does not require a global Python, Node.js or Stockfish installation.

1. PyInstaller creates a one-directory backend executable containing the
   Python runtime, API dependencies and the local opening catalogue.
2. Electron Builder places that backend beside the packaged Electron resources
   and creates a per-user NSIS installer.

Electron Builder stages the Electron runtime already installed by `npm` through
the configured `electronDist` directory. This avoids a redundant download and
extraction on every package run and improves offline reproducibility. The Vite
development watcher explicitly ignores `release` and `dist-electron`, so a
running renderer does not lock packaging output while Electron Builder replaces
it.

Both packaging commands invoke Electron's own idempotent installer first. It is
a no-op when the matching runtime is present and restores `electronDist` when a
clean or security-hardened `npm ci` installed package metadata without running
the dependency's download hook.

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

## Trusted signing

The manual `Signed Windows release` GitHub Actions workflow is ready for an
Authenticode code-signing certificate. Configure these repository secrets:

- `WINDOWS_CSC_LINK`: a base64-encoded PFX or a private HTTPS download URL;
- `WINDOWS_CSC_KEY_PASSWORD`: the PFX password.

Electron Builder consumes them through `CSC_LINK` and `CSC_KEY_PASSWORD`. The
workflow then runs `scripts/verify-signature.ps1 -RequireTrusted` and refuses to
publish an unsigned or invalid artifact. Local builds can inspect their state
with `npm run verify:signature`; `NotSigned` is expected until a real publisher
certificate is supplied. A self-signed certificate is intentionally not used,
because it would not remove SmartScreen warnings or establish publisher trust.

## Upgrade and uninstall behavior

The stable `appId` (`dev.andrenv14.chessassistant`) gives NSIS a deterministic
application identity. A later installer with the same app ID and a higher
version upgrades that installation instead of creating an unrelated product.
Changing the app ID is therefore a breaking packaging change.

The installer removes application binaries and its shortcuts on uninstall, but
local user data is deliberately preserved. Profiles and analysis history live
in `%LOCALAPPDATA%\ChessAssistant\chess-assistant.sqlite3`; API credentials are
never written to that database. History can be cleared from inside the desktop.
For a complete manual reset after uninstall, the user may remove the
`%LOCALAPPDATA%\ChessAssistant` directory after deciding that its local history
and profiles are no longer needed.

This preservation policy prevents a normal upgrade or reinstall from silently
destroying analysis history. A future installer must not change it without an
explicit migration and release-note entry.

## Verification checklist

Before publishing an installer:

1. install it on a clean Windows user or disposable VM;
2. confirm `/health` reports the packaged Stockfish and 3,815 opening entries;
3. analyze a position, change both advisor strengths and restart the app;
4. confirm analysis history and strength profiles persist;
5. load the extension separately and verify Lichess and Chess.com Analysis;
6. uninstall the desktop app and confirm user data behavior is documented for
   that release.

The automated `npm run qa:installer` check performs items 2, 3 and 6 in an
isolated data directory. It also connects to the installed Electron renderer
through its temporary debugging port and requires the React interface to mount
from `file://` assets. On every push to `main`, the `Clean Windows install and
extension smoke` CI job repeats the complete unsigned build, packaged-backend
analysis, install/uninstall and compiled-extension path on a fresh hosted
Windows VM. Authenticated third-party-site sessions remain a separate live
compatibility check because repository CI never receives personal browser
credentials.

The browser extension remains a separate unpacked artifact in this milestone;
loading or publishing it is intentionally not hidden inside the desktop
installer.
