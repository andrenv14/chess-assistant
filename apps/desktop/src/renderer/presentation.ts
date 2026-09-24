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
import type { PlanHint } from "@chess-assistant/contracts";

const PLAN_LABELS: Record<PlanHint, string> = {
  force_king_response: "forçar uma resposta do rei",
  trade_or_win_material: "trocar ou ganhar material",
  secure_king: "colocar o rei em segurança",
  develop_and_coordinate: "desenvolver e coordenar as peças",
  contest_center: "disputar o centro",
  advance_passed_pawn: "avançar o peão passado",
  create_passed_pawn: "criar um peão passado",
  promote_pawn: "promover o peão",
  improve_king_safety: "reforçar a segurança do rei",
};


export function formatPlanHint(hint: PlanHint): string {
  return PLAN_LABELS[hint];
}
