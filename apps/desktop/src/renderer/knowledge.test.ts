import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import { developmentMetric, kingSafetyMetric, pawnHealthMetric } from "./knowledge";

describe("developmentMetric", () => {
  it("starts at zero and grows as minors, center and castling improve", () => {
    const board = new Chess();
    expect(developmentMetric(board.fen(), "w", false)).toEqual({
      centerPieces: 0,
      developedMinors: 0,
      label: "Inicial",
      score: 0,
    });
    for (const move of ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "O-O"]) board.move(move);
    expect(developmentMetric(board.fen(), "w", true)).toEqual({
      centerPieces: 1,
      developedMinors: 2,
      label: "Em progresso",
      score: 68,
    });
  });

  it("does not mistake captured home pieces for developed pieces", () => {
    const board = new Chess("rnbqkbnr/pppp1ppp/8/8/8/8/PPPP1PPP/RNBQK2R w KQkq - 0 1");
    expect(developmentMetric(board.fen(), "w", false).developedMinors).toBe(0);
  });
});

describe("knowledge health metrics", () => {
  it("penalizes open king lines and enemy attackers", () => {
    expect(kingSafetyMetric({
      king_square: "g1",
      castled_position: true,
      pawn_shield_count: 3,
      files_without_friendly_pawn: [],
      attacked_zone_squares: [],
      enemy_attackers: [],
    })).toEqual({ label: "Protegido", score: 86 });
    expect(kingSafetyMetric({
      king_square: "e1",
      castled_position: false,
      pawn_shield_count: 1,
      files_without_friendly_pawn: ["e", "f"],
      attacked_zone_squares: ["e2", "f2"],
      enemy_attackers: ["b4", "h4"],
    })).toEqual({ label: "Exposto", score: 0 });
  });

  it("summarizes structural health without pretending it is an engine score", () => {
    expect(pawnHealthMetric({
      doubled_files: [],
      isolated_squares: [],
      passed_squares: [],
      pawn_island_count: 1,
      connected_squares: ["d4", "e4"],
      connected_passed_squares: [],
    })).toEqual({ label: "Coesa", score: 100 });
  });
});
