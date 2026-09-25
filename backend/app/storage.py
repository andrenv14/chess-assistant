import hashlib
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock

from pydantic import ValidationError

from app.logging_config import get_logger, position_id
from app.models import (
    AnalysisEvidenceResponse,
    AnalysisHistorySummary,
    EngineRole,
    EngineSettings,
)

logger = get_logger(__name__)


class StorageError(RuntimeError):
    pass


class LocalStore:
    """SQLite persistence for local profiles and deterministic analysis evidence."""

    def __init__(self, database_path: Path, *, history_limit: int = 200) -> None:
        self.database_path = database_path
        self.history_limit = history_limit
        self.available = False
        self._lock = Lock()

    def initialize(self) -> None:
        try:
            self.database_path.parent.mkdir(parents=True, exist_ok=True)
            with self._connect() as connection:
                connection.executescript(
                    """
                    PRAGMA journal_mode = WAL;
                    PRAGMA foreign_keys = ON;
                    CREATE TABLE IF NOT EXISTS engine_profiles (
                        role TEXT PRIMARY KEY,
                        settings_json TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS analysis_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        position_hash TEXT NOT NULL,
                        actor TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        evidence_json TEXT NOT NULL,
                        UNIQUE(position_hash, actor)
                    );
                    CREATE INDEX IF NOT EXISTS analysis_history_created_at
                    ON analysis_history(created_at DESC, id DESC);
                    PRAGMA user_version = 1;
                    """
                )
            self.available = True
        except (OSError, sqlite3.Error) as exc:
            self.available = False
            raise StorageError("local storage initialization failed") from exc

    def save_profile(self, role: EngineRole, profile: EngineSettings) -> None:
        self._require_available()
        now = datetime.now(UTC).isoformat()
        try:
            with self._lock, self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO engine_profiles(role, settings_json, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(role) DO UPDATE SET
                        settings_json = excluded.settings_json,
                        updated_at = excluded.updated_at
                    """,
                    (role, profile.model_dump_json(), now),
                )
        except sqlite3.Error as exc:
            raise StorageError("engine profile persistence failed") from exc

    def load_profiles(self) -> dict[EngineRole, EngineSettings]:
        self._require_available()
        profiles: dict[EngineRole, EngineSettings] = {}
        try:
            with self._lock, self._connect() as connection:
                rows = connection.execute(
                    "SELECT role, settings_json FROM engine_profiles"
                ).fetchall()
        except sqlite3.Error as exc:
            raise StorageError("engine profile loading failed") from exc

        for row in rows:
            role = row["role"]
            if role not in {"user", "opponent", "evaluator"}:
                continue
            try:
                profiles[role] = EngineSettings.model_validate_json(row["settings_json"])
            except ValidationError:
                logger.warning(
                    "stored_profile_rejected",
                    extra={"event_data": {"role": role}},
                )
        return profiles

    def save_analysis(self, evidence: AnalysisEvidenceResponse) -> None:
        self._require_available()
        fen = evidence.analysis.fen
        actor = evidence.analysis.actor
        digest = hashlib.sha256(fen.encode("utf-8")).hexdigest()
        now = datetime.now(UTC).isoformat()
        try:
            with self._lock, self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO analysis_history(
                        position_hash, actor, created_at, evidence_json
                    ) VALUES (?, ?, ?, ?)
                    ON CONFLICT(position_hash, actor) DO UPDATE SET
                        created_at = excluded.created_at,
                        evidence_json = excluded.evidence_json
                    """,
                    (digest, actor, now, evidence.model_dump_json()),
                )
                connection.execute(
                    """
                    DELETE FROM analysis_history
                    WHERE id NOT IN (
                        SELECT id FROM analysis_history
                        ORDER BY created_at DESC, id DESC
                        LIMIT ?
                    )
                    """,
                    (self.history_limit,),
                )
        except sqlite3.Error as exc:
            raise StorageError("analysis history persistence failed") from exc

        logger.info(
            "analysis_history_saved",
            extra={
                "event_data": {
                    "position_id": position_id(fen),
                    "actor": actor,
                }
            },
        )

    def list_history(self, *, limit: int = 20) -> list[AnalysisHistorySummary]:
        self._require_available()
        bounded_limit = max(1, min(limit, 100))
        try:
            with self._lock, self._connect() as connection:
                rows = connection.execute(
                    """
                    SELECT id, created_at, evidence_json
                    FROM analysis_history
                    ORDER BY created_at DESC, id DESC
                    LIMIT ?
                    """,
                    (bounded_limit,),
                ).fetchall()
        except sqlite3.Error as exc:
            raise StorageError("analysis history loading failed") from exc

        summaries: list[AnalysisHistorySummary] = []
        for row in rows:
            evidence = self._parse_evidence(row["id"], row["evidence_json"])
            if evidence is None:
                continue
            opening = evidence.analysis.opening
            summaries.append(
                AnalysisHistorySummary(
                    id=row["id"],
                    created_at=row["created_at"],
                    fen=evidence.analysis.fen,
                    actor=evidence.analysis.actor,
                    evaluation_cp=evidence.analysis.evaluation_cp,
                    evaluation_mate=evidence.analysis.evaluation_mate,
                    opening_eco=opening.eco if opening else None,
                    opening_name=opening.name if opening else None,
                    candidate_san=[move.san for move in evidence.analysis.candidates],
                )
            )
        return summaries

    def get_history(self, history_id: int) -> AnalysisEvidenceResponse | None:
        self._require_available()
        try:
            with self._lock, self._connect() as connection:
                row = connection.execute(
                    "SELECT evidence_json FROM analysis_history WHERE id = ?",
                    (history_id,),
                ).fetchone()
        except sqlite3.Error as exc:
            raise StorageError("analysis history loading failed") from exc
        if row is None:
            return None
        return self._parse_evidence(history_id, row["evidence_json"])

    def clear_history(self) -> int:
        self._require_available()
        try:
            with self._lock, self._connect() as connection:
                cursor = connection.execute("DELETE FROM analysis_history")
                return cursor.rowcount
        except sqlite3.Error as exc:
            raise StorageError("analysis history clearing failed") from exc

    def history_count(self) -> int:
        self._require_available()
        try:
            with self._lock, self._connect() as connection:
                row = connection.execute(
                    "SELECT COUNT(*) AS count FROM analysis_history"
                ).fetchone()
        except sqlite3.Error as exc:
            raise StorageError("analysis history count failed") from exc
        return int(row["count"])

    def _parse_evidence(
        self,
        history_id: int,
        payload: str,
    ) -> AnalysisEvidenceResponse | None:
        try:
            return AnalysisEvidenceResponse.model_validate_json(payload)
        except ValidationError:
            logger.warning(
                "stored_analysis_rejected",
                extra={"event_data": {"history_id": history_id}},
            )
            return None

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=5)
        connection.row_factory = sqlite3.Row
        return connection

    def _require_available(self) -> None:
        if not self.available:
            raise StorageError("local storage is unavailable")
