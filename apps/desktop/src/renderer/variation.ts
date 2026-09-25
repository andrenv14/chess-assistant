import { Chess } from "chess.js";

export interface VariationFrame {
  fen: string;
  ply: number;
  san: string;
  uci: string;
}

export function buildVariationFrames(rootFen: string, moves: string[]): VariationFrame[] {
  const board = new Chess(rootFen);
  const frames: VariationFrame[] = [];

  for (const [index, uci] of moves.entries()) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) break;
    try {
      const played = board.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4],
      });
      frames.push({ fen: board.fen(), ply: index + 1, san: played.san, uci });
    } catch {
      break;
    }
  }
  return frames;
}

export function candidateGapLabel(
  bestCp: number | null,
  candidateCp: number | null,
  sideToMove: "white" | "black",
): string | null {
  if (bestCp === null || candidateCp === null) return null;
  const signedGap = sideToMove === "white" ? bestCp - candidateCp : candidateCp - bestCp;
  const gap = Math.max(0, signedGap);
  if (gap < 5) return "mesma avaliação";
  return `${(gap / 100).toFixed(2)} atrás da principal`;
}
