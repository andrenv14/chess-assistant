import hashlib
import json
import logging
from datetime import UTC, datetime


class JsonFormatter(logging.Formatter):
    """Small JSON formatter that keeps local logs machine-readable and redaction-friendly."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname.lower(),
            "logger": record.name,
            "event": record.getMessage(),
        }
        event_data = getattr(record, "event_data", None)
        if isinstance(event_data, dict):
            payload.update(event_data)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level: int = logging.INFO) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def position_id(fen: str) -> str:
    """Return a non-reversible short identifier so logs do not store complete games."""
    return hashlib.sha256(fen.encode("utf-8")).hexdigest()[:12]
