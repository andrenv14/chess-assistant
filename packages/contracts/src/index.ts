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
  llm_configured: boolean;
  llm_model: string | null;
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
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "miss"
  | "blunder";

export type MoveClassificationRule =
  | "book"
  | "brilliant_sacrifice"
  | "unique_best_move"
  | "missed_forcing_opportunity"
  | "expected_points";

export type PlanHint =
  | "deliver_checkmate"
  | "force_check_response"
  | "fork_pieces"
  | "pin_piece"
  | "relative_pin_piece"
  | "discovered_attack"
  | "attack_loose_piece"
  | "capture_or_exchange_material"
  | "secure_king"
  | "develop_and_coordinate"
  | "contest_center"
  | "advance_passed_pawn"
  | "create_passed_pawn"
  | "promote_pawn"
  | "improve_king_safety"
  | "occupy_outpost"
  | "create_outpost"
  | "exploit_open_file"
  | "activate_rook_on_seventh"
  | "pawn_break"
  | "gain_space"
  | "improve_piece_activity"
  | "centralize_king"
  | "remove_defender"
  | "interfere_attack"
  | "connect_rooks";

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
  evidence: {
    rule: MoveClassificationRule;
    played_is_engine_best: boolean;
    sacrifice_detected: boolean;
    best_move_is_forcing: boolean;
    second_best_move_uci: string | null;
    second_best_move_san: string | null;
    second_best_expected_points: number | null;
    second_best_expected_points_loss: number | null;
  };
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
  pawn_island_count: number;
  connected_squares: string[];
  connected_passed_squares: string[];
}

export interface KingSafetyFeatures {
  king_square: string;
  castled_position: boolean;
  pawn_shield_count: number;
  files_without_friendly_pawn: string[];
  attacked_zone_squares: string[];
  enemy_attackers: string[];
}

export interface FileFeatures {
  open_files: string[];
  white_semi_open_files: string[];
  black_semi_open_files: string[];
}

export interface StrategicFeatures {
  files: FileFeatures;
  white_bishop_pair: boolean;
  black_bishop_pair: boolean;
  white_weak_squares: string[];
  black_weak_squares: string[];
  white_potential_outposts: string[];
  black_potential_outposts: string[];
  white_occupied_outposts: string[];
  black_occupied_outposts: string[];
  white_space_count: number;
  black_space_count: number;
  space_balance: number;
  white_rooks_on_open_files: string[];
  black_rooks_on_open_files: string[];
  white_rooks_on_semi_open_files: string[];
  black_rooks_on_semi_open_files: string[];
  white_seventh_rank_rooks: string[];
  black_seventh_rank_rooks: string[];
  white_bad_bishops: string[];
  black_bad_bishops: string[];
  white_pawn_majority_wings: Array<"queenside" | "kingside">;
  black_pawn_majority_wings: Array<"queenside" | "kingside">;
}

export interface EndgameFeatures {
  active: boolean;
  king_and_pawn_endgame: boolean;
  pure_rook_endgame: boolean;
  opposite_colored_bishop_endgame: boolean;
  same_colored_bishop_endgame: boolean;
  direct_opposition_holder: "white" | "black" | null;
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
  strategic: StrategicFeatures;
  endgame: EndgameFeatures;
  tactics: {
    side_to_move_in_check: boolean;
    legal_move_count: number;
    capture_count: number;
    checking_moves: string[];
    mate_in_one_moves: string[];
    white_pinned: string[];
    black_pinned: string[];
    white_undefended_attacked: string[];
    black_undefended_attacked: string[];
  };
}

export interface MoveFacts {
  is_capture: boolean;
  captured_piece: string | null;
  gives_check: boolean;
  gives_checkmate: boolean;
  fork_targets: string[];
  newly_pinned_targets: string[];
  newly_relative_pinned_targets: string[];
  discovered_attack_targets: string[];
  newly_attacked_undefended_targets: string[];
  is_castling: boolean;
  promotion_piece: string | null;
  develops_minor_piece: boolean;
  occupies_center: boolean;
  moves_passed_pawn: boolean;
  creates_passed_pawn: boolean;
  improves_pawn_shield: boolean;
  occupies_outpost: boolean;
  creates_outpost: boolean;
  rook_to_open_file: boolean;
  rook_to_seventh_rank: boolean;
  pawn_break: boolean;
  space_gain: number;
  mobility_gain: number;
  centralizes_king: boolean;
  removed_defender_targets: string[];
  interfered_attack_targets: string[];
  connects_rooks: boolean;
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

export interface AnalysisHistorySummary {
  id: number;
  created_at: string;
  fen: string;
  actor: "user" | "opponent";
  evaluation_cp: number | null;
  evaluation_mate: number | null;
  opening_eco: string | null;
  opening_name: string | null;
  candidate_san: string[];
}

export interface HistoryClearResponse {
  deleted: number;
}

export interface CandidateExplanation {
  uci: string;
  support_ids: string[];
  headline: string;
  explanation: string;
  plan_steps: string[];
  opponent_reply_uci: string | null;
  opponent_response: string;
  watch_for: string | null;
}

export interface PositionExplanation {
  position_support_ids: string[];
  position_summary: string;
  candidates: CandidateExplanation[];
}

export interface ExplainedAnalysisResponse {
  evidence: AnalysisEvidenceResponse;
  explanation: PositionExplanation;
}

export interface BrowserPositionEvent {
  type: "position";
  fen: string;
  source:
    | "lichess-analysis"
    | "lichess-live"
    | "chesscom-analysis"
    | "chesscom-live"
    | "manual";
  at: string;
}

export type BrowserEvent = BrowserPositionEvent;

export { logEvent } from "./logger";
export type { LogLevel } from "./logger";
