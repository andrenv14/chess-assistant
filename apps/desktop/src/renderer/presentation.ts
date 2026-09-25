export function formatEvaluation(cp: number | null, mate: number | null): string {
  if (mate !== null) return `${mate < 0 ? "-" : ""}M${Math.abs(mate)}`;
  if (cp === null) return "—";
  return `${cp >= 0 ? "+" : ""}${(cp / 100).toFixed(2)}`;
}

export function evaluationToWhitePercent(cp: number | null, mate: number | null): number {
  if (mate !== null) return mate > 0 ? 100 : 0;
  if (cp === null) return 50;
  return Math.max(3, Math.min(97, 50 + 50 * (2 / (1 + Math.exp(-cp / 220)) - 1)));
}

export function formatProbability(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}
import type {
  MoveFacts,
  PlanHint,
  PositionFeaturesResponse,
} from "@chess-assistant/contracts";

const PLAN_LABELS: Record<PlanHint, string> = {
  deliver_checkmate: "finalizar com xeque-mate",
  force_check_response: "exigir uma resposta ao xeque",
  fork_pieces: "atacar duas peças ao mesmo tempo",
  pin_piece: "cravar uma peça contra o rei",
  relative_pin_piece: "cravar uma peça contra outra de maior valor",
  discovered_attack: "abrir um ataque descoberto",
  attack_loose_piece: "atacar uma peça sem defesa",
  capture_or_exchange_material: "capturar ou trocar material",
  secure_king: "colocar o rei em segurança",
  develop_and_coordinate: "desenvolver e coordenar as peças",
  contest_center: "disputar o centro",
  advance_passed_pawn: "avançar o peão passado",
  create_passed_pawn: "criar um peão passado",
  promote_pawn: "promover o peão",
  improve_king_safety: "reforçar a segurança do rei",
};

function formatSquares(squares: string[]): string {
  if (squares.length < 2) return squares[0] ?? "";
  return `${squares.slice(0, -1).join(", ")} e ${squares.at(-1)}`;
}

export function formatPositionThemes(position: PositionFeaturesResponse): string[] {
  const themes: string[] = [];
  const files = position.strategic.files;
  if (files.open_files.length) {
    themes.push(`Colunas abertas: ${formatSquares(files.open_files)}`);
  }
  if (files.white_semi_open_files.length) {
    themes.push(`Semiabertas para as brancas: ${formatSquares(files.white_semi_open_files)}`);
  }
  if (files.black_semi_open_files.length) {
    themes.push(`Semiabertas para as pretas: ${formatSquares(files.black_semi_open_files)}`);
  }
  if (position.strategic.white_bishop_pair !== position.strategic.black_bishop_pair) {
    themes.push(
      position.strategic.white_bishop_pair
        ? "As brancas têm o par de bispos"
        : "As pretas têm o par de bispos",
    );
  }
  if (position.white_pawns.pawn_island_count > 1) {
    themes.push(`Brancas: ${position.white_pawns.pawn_island_count} ilhas de peões`);
  }
  if (position.black_pawns.pawn_island_count > 1) {
    themes.push(`Pretas: ${position.black_pawns.pawn_island_count} ilhas de peões`);
  }
  if (position.white_pawns.connected_passed_squares.length) {
    themes.push(
      `Passados conectados brancos: ${formatSquares(position.white_pawns.connected_passed_squares)}`,
    );
  }
  if (position.black_pawns.connected_passed_squares.length) {
    themes.push(
      `Passados conectados pretos: ${formatSquares(position.black_pawns.connected_passed_squares)}`,
    );
  }

  if (position.endgame.king_and_pawn_endgame) themes.push("Final de reis e peões");
  if (position.endgame.pure_rook_endgame) themes.push("Final puro de torres");
  if (position.endgame.opposite_colored_bishop_endgame) {
    themes.push("Final de bispos de cores opostas");
  }
  if (position.endgame.same_colored_bishop_endgame) {
    themes.push("Final de bispos da mesma cor");
  }
  if (position.endgame.direct_opposition_holder) {
    themes.push(
      `Oposição direta: ${position.endgame.direct_opposition_holder === "white" ? "brancas" : "pretas"}`,
    );
  }

  if (position.white_king.enemy_attackers.length >= 2) {
    themes.push(`Pressão sobre o rei branco: ${position.white_king.enemy_attackers.length} atacantes`);
  }
  if (position.black_king.enemy_attackers.length >= 2) {
    themes.push(`Pressão sobre o rei preto: ${position.black_king.enemy_attackers.length} atacantes`);
  }
  return themes;
}

export function formatPlanHint(hint: PlanHint, facts?: MoveFacts): string {
  if (hint === "fork_pieces" && facts?.fork_targets.length) {
    return `garfo em ${formatSquares(facts.fork_targets)}`;
  }
  if (hint === "pin_piece" && facts?.newly_pinned_targets.length) {
    return `cravar ${formatSquares(facts.newly_pinned_targets)} contra o rei`;
  }
  if (hint === "relative_pin_piece" && facts?.newly_relative_pinned_targets.length) {
    return `cravar relativamente ${formatSquares(facts.newly_relative_pinned_targets)}`;
  }
  if (hint === "discovered_attack" && facts?.discovered_attack_targets.length) {
    return `abrir ataque descoberto contra ${formatSquares(facts.discovered_attack_targets)}`;
  }
  if (hint === "attack_loose_piece" && facts?.newly_attacked_undefended_targets.length) {
    return `atacar ${formatSquares(facts.newly_attacked_undefended_targets)} sem defesa`;
  }
  return PLAN_LABELS[hint];
}
