export type EngineRole = "user" | "opponent" | "evaluator";

export interface EngineSettings {
  enabled: boolean;
  limit_strength: boolean;
  elo: number;
  skill_level: number;
  move_time_ms: number | null;
  depth: number | null;
  multipv: number;
  threads: number;
  hash_mb: number;
}

export interface EngineSettingsResponse {
  stockfish_path: string | null;
  maia3_available: boolean;
  maia3_path: string | null;
  profiles: Record<EngineRole, EngineSettings>;
}

export interface ReplyAnalysis {
  uci: string;
  san: string;
  score_cp: number | null;
  mate: number | null;
  pv_uci: string[];
  pv_san: string[];
}

export interface MoveAnalysis extends ReplyAnalysis {
  replies: ReplyAnalysis[];
}

export interface OpeningInfo {
  eco: string;
  name: string;
  pgn: string;
  uci_moves: string[];
  ply_count: number;
  source: "lichess-chess-openings";
}

export interface AnalyzeRequest {
  fen: string;
  actor: "user" | "opponent";
  include_evaluator: boolean;
  include_replies: boolean;
}

export interface AnalyzeResponse {
  fen: string;
  actor: "user" | "opponent";
  advisor_role: EngineRole;
  reply_role: EngineRole;
  evaluation_cp: number | null;
  evaluation_mate: number | null;
  candidates: MoveAnalysis[];
  opening: OpeningInfo | null;
}

export type MoveClassificationKey =
  | "book"
  | "best"
  | "excellent"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder";

export type PlanHint =
  | "force_king_response"
  | "trade_or_win_material"
  | "secure_king"
  | "develop_and_coordinate"
  | "contest_center"
  | "advance_passed_pawn"
  | "create_passed_pawn"
  | "promote_pawn"
  | "improve_king_safety";

export interface ClassifyMoveRequest {
  before_fen: string;
  after_fen: string;
}

export interface MoveClassificationResponse {
  uci: string;
  san: string;
  best_move_uci: string;
  best_move_san: string;
  classification: MoveClassificationKey;
  label: string;
  symbol: string;
  expected_points_before: number;
  expected_points_after: number;
  expected_points_loss: number;
  evaluation_before_cp: number | null;
  evaluation_before_mate: number | null;
  evaluation_after_cp: number | null;
  evaluation_after_mate: number | null;
  opening: OpeningInfo | null;
}

export interface HumanPredictionRequest {
  fen: string;
  self_elo: number;
  opponent_elo: number;
  multipv: number;
}

export interface HumanMovePrediction {
  rank: number;
  uci: string;
  san: string;
  win_probability: number | null;
  draw_probability: number | null;
  loss_probability: number | null;
}

export interface HumanPredictionResponse {
  fen: string;
  self_elo: number;
  opponent_elo: number;
  model: "maia3-5m";
  candidates: HumanMovePrediction[];
}

export interface SideMaterial {
  pawns: number;
  knights: number;
  bishops: number;
  rooks: number;
  queens: number;
  value_cp: number;
}

export interface PawnFeatures {
  doubled_files: string[];
  isolated_squares: string[];
  passed_squares: string[];
}

export interface KingSafetyFeatures {
  king_square: string;
  castled_position: boolean;
  pawn_shield_count: number;
  open_nearby_files: string[];
}

export interface PositionFeaturesRequest {
  fen: string;
}

export interface PositionFeaturesResponse {
  fen: string;
  phase: "opening" | "middlegame" | "endgame";
  side_to_move: "white" | "black";
  material: {
    white: SideMaterial;
    black: SideMaterial;
    balance_cp: number;
  };
  white_pawns: PawnFeatures;
  black_pawns: PawnFeatures;
  white_king: KingSafetyFeatures;
  black_king: KingSafetyFeatures;
  tactics: {
    side_to_move_in_check: boolean;
    legal_move_count: number;
    capture_count: number;
    checking_moves: string[];
    white_undefended_attacked: string[];
    black_undefended_attacked: string[];
  };
}

export interface MoveFacts {
  is_capture: boolean;
  captured_piece: string | null;
  gives_check: boolean;
  is_castling: boolean;
  promotion_piece: string | null;
  develops_minor_piece: boolean;
  occupies_center: boolean;
  moves_passed_pawn: boolean;
  creates_passed_pawn: boolean;
  improves_pawn_shield: boolean;
}

export interface CandidateEvidence {
  rank: number;
  uci: string;
  san: string;
  facts: MoveFacts;
  plan_hints: PlanHint[];
  principal_variation_san: string[];
  opponent_replies: ReplyAnalysis[];
}

export interface AnalysisEvidenceResponse {
  analysis: AnalyzeResponse;
  position: PositionFeaturesResponse;
  candidates: CandidateEvidence[];
}

export interface BrowserPositionEvent {
  type: "position";
  fen: string;
  source: "lichess-analysis" | "chesscom-analysis" | "manual";
  at: string;
}

export type BrowserEvent = BrowserPositionEvent;

export { logEvent } from "./logger";
export type { LogLevel } from "./logger";
