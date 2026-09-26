import os
import sys
from pathlib import Path
from shutil import which

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def discover_stockfish_path() -> Path | None:
    """Find an engine installed by our helper or available on PATH.

    An explicit ``STOCKFISH_PATH`` environment variable still has precedence
    because pydantic-settings replaces this default value.
    """
    vendor_root = Path(__file__).resolve().parent.parent / "vendor" / "stockfish"
    if vendor_root.is_dir():
        suffix = ".exe" if os.name == "nt" else ""
        candidates = sorted(vendor_root.glob(f"stockfish*{suffix}"))
        if candidates:
            return candidates[0]

    executable = which("stockfish") or which("stockfish.exe")
    return Path(executable) if executable else None


def discover_maia3_path() -> Path | None:
    backend_root = Path(__file__).resolve().parent.parent
    scripts_directory = "Scripts" if os.name == "nt" else "bin"
    executable_name = "maia3-5m.exe" if os.name == "nt" else "maia3-5m"
    managed = backend_root / "vendor" / "maia3-venv" / scripts_directory / executable_name
    if managed.is_file():
        return managed

    executable = which("maia3-5m") or which("maia3-5m.exe")
    return Path(executable) if executable else None


def default_data_dir() -> Path:
    """Return an OS-appropriate local application-data directory."""
    if os.name == "nt" and (local_app_data := os.environ.get("LOCALAPPDATA")):
        return Path(local_app_data) / "ChessAssistant"
    if xdg_data_home := os.environ.get("XDG_DATA_HOME"):
        return Path(xdg_data_home) / "chess-assistant"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "ChessAssistant"
    return Path.home() / ".local" / "share" / "chess-assistant"


class AppSettings(BaseSettings):
    stockfish_path: Path | None = Field(default_factory=discover_stockfish_path)
    maia3_path: Path | None = Field(default_factory=discover_maia3_path)
    chess_assistant_host: str = "127.0.0.1"
    chess_assistant_port: int = 8765
    chess_assistant_data_dir: Path = Field(default_factory=default_data_dir)
    history_limit: int = Field(default=200, ge=10, le=5000)
    llm_api_base_url: str | None = None
    llm_api_key: str | None = None
    llm_model: str | None = None
    llm_max_output_tokens: int = Field(default=3200, ge=256, le=8000)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = AppSettings()
