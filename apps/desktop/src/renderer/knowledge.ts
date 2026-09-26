import type { KingSafetyFeatures, PawnFeatures } from "@chess-assistant/contracts";
import { Chess, type Color, type Square } from "chess.js";

const HOME_MINOR_SQUARES: Record<Color, Square[]> = {
  w: ["b1", "c1", "f1", "g1"],
  b: ["b8", "c8", "f8", "g8"],
};
const CENTER_SQUARES: Square[] = ["d4", "e4", "d5", "e5"];

export interface DevelopmentMetric {
  centerPieces: number;
  developedMinors: number;
  label: string;
  score: number;
}

export interface HealthMetric {
  label: string;
  score: number;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function developmentMetric(
  fen: string,
  color: Color,
  castled: boolean,
): DevelopmentMetric {
  const board = new Chess(fen);
  // This is an explainable position indicator, not an engine evaluation. Count
  // only surviving minor pieces that are actually off their original squares;
  // an empty home square alone could also mean that the piece was exchanged.
  const developedMinors = board.board().flat().filter((piece) => (
    piece
    && piece.color === color
    && (piece.type === "b" || piece.type === "n")
    && !HOME_MINOR_SQUARES[color].includes(piece.square)
  )).length;
  const centerPieces = CENTER_SQUARES.filter((square) => board.get(square)?.color === color).length;
  const score = clamp(developedMinors * 16 + centerPieces * 10 + (castled ? 26 : 0));
  const label = score >= 75 ? "Completo" : score >= 45 ? "Em progresso" : "Inicial";
  return { centerPieces, developedMinors, label, score };
}

export function kingSafetyMetric(features: KingSafetyFeatures): HealthMetric {
  const score = clamp(
    20
      + features.pawn_shield_count * 12
      + (features.castled_position ? 30 : 0)
      - features.enemy_attackers.length * 15
      - features.files_without_friendly_pawn.length * 8,
  );
  const label = score >= 75 ? "Protegido" : score >= 45 ? "Atenção" : "Exposto";
  return { label, score };
}

export function pawnHealthMetric(features: PawnFeatures): HealthMetric {
  const score = clamp(
    100
      - features.isolated_squares.length * 11
      - features.doubled_files.length * 13
      - Math.max(0, features.pawn_island_count - 1) * 8
      + features.connected_squares.length * 2
      + features.connected_passed_squares.length * 5,
  );
  const label = score >= 80 ? "Coesa" : score >= 55 ? "Jogável" : "Fragmentada";
  return { label, score };
}
