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
}

export type MoveClassificationKey =
  | "book"
  | "best"
  | "excellent"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder";

export interface ClassifyMoveRequest {
  before_fen: string;
  after_fen: string;
  is_book: boolean;
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
