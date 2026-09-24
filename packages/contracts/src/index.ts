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

export type BrowserEvent =
  | {
      type: "position";
      fen: string;
      source: "lichess-analysis" | "chesscom-analysis" | "manual";
      at: string;
    }
  | {
      type: "candidate-move";
      uci: string;
      source: "lichess-analysis" | "chesscom-analysis";
      at: string;
    };
