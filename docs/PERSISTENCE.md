# Local persistence

Chess Assistant stores runtime engine profiles and recent deterministic analyses
in a local SQLite database. No database server or cloud account is required.

## Location and configuration

The default database is `chess-assistant.sqlite3` inside the operating system's
application-data directory:

- Windows: `%LOCALAPPDATA%\ChessAssistant`;
- macOS: `~/Library/Application Support/ChessAssistant`;
- Linux: `$XDG_DATA_HOME/chess-assistant`, or `~/.local/share/chess-assistant`.

Set `CHESS_ASSISTANT_DATA_DIR` to override that directory. `HISTORY_LIMIT`
controls retained unique positions and defaults to 200, with a supported range
of 10-5000.

The schema starts at SQLite `user_version = 1`. WAL mode is enabled, so the
database can temporarily have `-wal` and `-shm` sidecar files while the backend
is running. Stop the backend before copying the database as a manual backup.

## Persisted data

- the complete validated settings for `user`, `opponent` and `evaluator`;
- deterministic analysis evidence, Stockfish candidates and any opponent
  replies present in the completed API bundle;
- full FEN, actor, evaluation, opening and creation time for local history.

The API key, LLM prompt, raw provider response and generated prose are never
stored in SQLite. Full FEN is intentionally stored because restoring a position
requires it; logs continue to use only a one-way short position identifier.

An exact FEN/actor pair is updated instead of duplicated. The oldest unique
positions beyond the configured retention limit are deleted automatically.

## API and desktop behavior

- `GET /api/history?limit=20` lists summaries, capped at 100 per request;
- `GET /api/history/{id}` restores the complete deterministic evidence bundle;
- `DELETE /api/history` clears analysis history but preserves engine profiles.

The desktop lists recent positions, restores them without rerunning Stockfish
and asks for confirmation before clearing them. Changing FEN or actor invalidates
in-flight analysis so an old result cannot overwrite the restored position.

If SQLite cannot initialize, engine analysis and runtime profile changes remain
available for the current process. Health reports `storage_available=false`,
history endpoints return 503, and persistence failures are logged without FEN,
profile JSON or secrets.
