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
