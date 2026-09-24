from typing import Literal

import chess
from pydantic import BaseModel, Field, field_validator, model_validator

EngineRole = Literal["user", "opponent", "evaluator"]
Actor = Literal["user", "opponent"]
MoveClassificationKey = Literal[
    "book",
    "best",
    "excellent",
    "good",
    "inaccuracy",
    "mistake",
    "blunder",
]


class EngineSettings(BaseModel):
    enabled: bool = True
    limit_strength: bool = True
    elo: int = Field(default=1600, ge=1320, le=3190)
    skill_level: int = Field(default=8, ge=0, le=20)
    move_time_ms: int | None = Field(default=500, ge=50, le=60_000)
    depth: int | None = Field(default=None, ge=1, le=40)
    multipv: int = Field(default=3, ge=1, le=5)
    threads: int = Field(default=1, ge=1, le=32)
    hash_mb: int = Field(default=128, ge=16, le=4096)

    @model_validator(mode="after")
    def analysis_limit_is_present(self) -> "EngineSettings":
        if self.move_time_ms is None and self.depth is None:
            raise ValueError("set move_time_ms or depth")
        return self


def default_profiles() -> dict[EngineRole, EngineSettings]:
    return {
        "user": EngineSettings(elo=1600, skill_level=8, multipv=3),
        "opponent": EngineSettings(elo=1800, skill_level=10, multipv=2),
        "evaluator": EngineSettings(
            limit_strength=False,
            elo=3190,
            skill_level=20,
            move_time_ms=800,
            multipv=1,
            threads=2,
            hash_mb=256,
        ),
    }


class SettingsResponse(BaseModel):
    stockfish_path: str | None
    profiles: dict[EngineRole, EngineSettings]


class AnalyzeRequest(BaseModel):
    fen: str
    actor: Actor = "user"
    include_evaluator: bool = True
    include_replies: bool = True

    @field_validator("fen")
    @classmethod
    def validate_fen(cls, value: str) -> str:
        try:
            chess.Board(value)
        except ValueError as exc:
            raise ValueError("invalid FEN") from exc
        return value


class ReplyAnalysis(BaseModel):
    uci: str
    san: str
    score_cp: int | None
    mate: int | None
    pv_uci: list[str]
    pv_san: list[str]


class MoveAnalysis(ReplyAnalysis):
    replies: list[ReplyAnalysis] = Field(default_factory=list)


class AnalyzeResponse(BaseModel):
    fen: str
    actor: Actor
    advisor_role: EngineRole
    reply_role: EngineRole
    evaluation_cp: int | None
    evaluation_mate: int | None
    candidates: list[MoveAnalysis]


class ClassifyMoveRequest(BaseModel):
    before_fen: str
    after_fen: str
    is_book: bool = False

    _validate_before = field_validator("before_fen")(AnalyzeRequest.validate_fen.__func__)
    _validate_after = field_validator("after_fen")(AnalyzeRequest.validate_fen.__func__)


class MoveClassificationResponse(BaseModel):
    uci: str
    san: str
    best_move_uci: str
    best_move_san: str
    classification: MoveClassificationKey
    label: str
    symbol: str
    expected_points_before: float
    expected_points_after: float
    expected_points_loss: float
    evaluation_before_cp: int | None
    evaluation_before_mate: int | None
    evaluation_after_cp: int | None
    evaluation_after_mate: int | None


class BrowserPositionEvent(BaseModel):
    type: Literal["position"]
    fen: str
    source: Literal["lichess-analysis", "chesscom-analysis", "manual"]
    at: str

    _validate_fen = field_validator("fen")(AnalyzeRequest.validate_fen.__func__)


BrowserEvent = BrowserPositionEvent
