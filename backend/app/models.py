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
PlanHint = Literal[
    "deliver_checkmate",
    "force_check_response",
    "fork_pieces",
    "pin_piece",
    "attack_loose_piece",
    "capture_or_exchange_material",
    "secure_king",
    "develop_and_coordinate",
    "contest_center",
    "advance_passed_pawn",
    "create_passed_pawn",
    "promote_pawn",
    "improve_king_safety",
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
    maia3_available: bool
    maia3_path: str | None
    llm_configured: bool
    llm_model: str | None
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


class OpeningInfo(BaseModel):
    eco: str
    name: str
    pgn: str
    uci_moves: list[str]
    ply_count: int
    source: Literal["lichess-chess-openings"] = "lichess-chess-openings"


class AnalyzeResponse(BaseModel):
    fen: str
    actor: Actor
    advisor_role: EngineRole
    reply_role: EngineRole
    evaluation_cp: int | None
    evaluation_mate: int | None
    candidates: list[MoveAnalysis]
    opening: OpeningInfo | None = None


class ClassifyMoveRequest(BaseModel):
    before_fen: str
    after_fen: str

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
    opening: OpeningInfo | None = None


class HumanPredictionRequest(BaseModel):
    fen: str
    self_elo: int = Field(default=1500, ge=0, le=5000)
    opponent_elo: int = Field(default=1500, ge=0, le=5000)
    multipv: int = Field(default=5, ge=1, le=20)

    _validate_fen = field_validator("fen")(AnalyzeRequest.validate_fen.__func__)


class HumanMovePrediction(BaseModel):
    rank: int
    uci: str
    san: str
    win_probability: float | None
    draw_probability: float | None
    loss_probability: float | None


class HumanPredictionResponse(BaseModel):
    fen: str
    self_elo: int
    opponent_elo: int
    model: Literal["maia3-5m"] = "maia3-5m"
    candidates: list[HumanMovePrediction]


class PositionFeaturesRequest(BaseModel):
    fen: str

    _validate_fen = field_validator("fen")(AnalyzeRequest.validate_fen.__func__)


class SideMaterial(BaseModel):
    pawns: int
    knights: int
    bishops: int
    rooks: int
    queens: int
    value_cp: int


class MaterialFeatures(BaseModel):
    white: SideMaterial
    black: SideMaterial
    balance_cp: int


class PawnFeatures(BaseModel):
    doubled_files: list[str]
    isolated_squares: list[str]
    passed_squares: list[str]
    pawn_island_count: int
    connected_squares: list[str]
    connected_passed_squares: list[str]


class KingSafetyFeatures(BaseModel):
    king_square: str
    castled_position: bool
    pawn_shield_count: int
    files_without_friendly_pawn: list[str]
    attacked_zone_squares: list[str]
    enemy_attackers: list[str]


class FileFeatures(BaseModel):
    open_files: list[str]
    white_semi_open_files: list[str]
    black_semi_open_files: list[str]


class StrategicFeatures(BaseModel):
    files: FileFeatures
    white_bishop_pair: bool
    black_bishop_pair: bool


class EndgameFeatures(BaseModel):
    active: bool
    king_and_pawn_endgame: bool
    pure_rook_endgame: bool
    opposite_colored_bishop_endgame: bool
    same_colored_bishop_endgame: bool
    direct_opposition_holder: Literal["white", "black"] | None


class TacticalFeatures(BaseModel):
    side_to_move_in_check: bool
    legal_move_count: int
    capture_count: int
    checking_moves: list[str]
    mate_in_one_moves: list[str]
    white_pinned: list[str]
    black_pinned: list[str]
    white_undefended_attacked: list[str]
    black_undefended_attacked: list[str]


class PositionFeaturesResponse(BaseModel):
    fen: str
    phase: Literal["opening", "middlegame", "endgame"]
    side_to_move: Literal["white", "black"]
    material: MaterialFeatures
    white_pawns: PawnFeatures
    black_pawns: PawnFeatures
    white_king: KingSafetyFeatures
    black_king: KingSafetyFeatures
    strategic: StrategicFeatures
    endgame: EndgameFeatures
    tactics: TacticalFeatures


class MoveFacts(BaseModel):
    is_capture: bool
    captured_piece: str | None
    gives_check: bool
    gives_checkmate: bool
    fork_targets: list[str]
    newly_pinned_targets: list[str]
    newly_attacked_undefended_targets: list[str]
    is_castling: bool
    promotion_piece: str | None
    develops_minor_piece: bool
    occupies_center: bool
    moves_passed_pawn: bool
    creates_passed_pawn: bool
    improves_pawn_shield: bool


class CandidateEvidence(BaseModel):
    rank: int
    uci: str
    san: str
    facts: MoveFacts
    plan_hints: list[PlanHint]
    principal_variation_san: list[str]
    opponent_replies: list[ReplyAnalysis]


class AnalysisEvidenceResponse(BaseModel):
    analysis: AnalyzeResponse
    position: PositionFeaturesResponse
    candidates: list[CandidateEvidence]


class CandidateExplanation(BaseModel):
    uci: str
    headline: str = Field(min_length=1, max_length=100)
    explanation: str = Field(min_length=1, max_length=900)
    plan_steps: list[str] = Field(min_length=1, max_length=4)
    opponent_response: str = Field(min_length=1, max_length=600)
    watch_for: str | None = Field(default=None, max_length=400)

    @field_validator("plan_steps")
    @classmethod
    def validate_plan_steps(cls, value: list[str]) -> list[str]:
        if any(not step.strip() or len(step) > 240 for step in value):
            raise ValueError("plan steps must contain 1-240 characters")
        return value


class PositionExplanation(BaseModel):
    position_summary: str = Field(min_length=1, max_length=900)
    candidates: list[CandidateExplanation] = Field(max_length=5)


class ExplainedAnalysisResponse(BaseModel):
    evidence: AnalysisEvidenceResponse
    explanation: PositionExplanation


class BrowserPositionEvent(BaseModel):
    type: Literal["position"]
    fen: str
    source: Literal["lichess-analysis", "chesscom-analysis", "manual"]
    at: str

    _validate_fen = field_validator("fen")(AnalyzeRequest.validate_fen.__func__)


BrowserEvent = BrowserPositionEvent
