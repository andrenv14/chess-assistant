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
import type { MoveFacts, PlanHint } from "@chess-assistant/contracts";

const PLAN_LABELS: Record<PlanHint, string> = {
  deliver_checkmate: "finalizar com xeque-mate",
  force_check_response: "exigir uma resposta ao xeque",
  fork_pieces: "atacar duas peças ao mesmo tempo",
  pin_piece: "cravar uma peça contra o rei",
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

export function formatPlanHint(hint: PlanHint, facts?: MoveFacts): string {
  if (hint === "fork_pieces" && facts?.fork_targets.length) {
    return `garfo em ${formatSquares(facts.fork_targets)}`;
  }
  if (hint === "pin_piece" && facts?.newly_pinned_targets.length) {
    return `cravar ${formatSquares(facts.newly_pinned_targets)} contra o rei`;
  }
  if (hint === "attack_loose_piece" && facts?.newly_attacked_undefended_targets.length) {
    return `atacar ${formatSquares(facts.newly_attacked_undefended_targets)} sem defesa`;
  }
  return PLAN_LABELS[hint];
}
