import { describe, expect, it } from "vitest";

import {
  evaluationToWhitePercent,
  formatEvaluation,
  formatPlanHint,
  formatProbability,
} from "./presentation";

describe("formatEvaluation", () => {
  it("formats centipawns from White's perspective", () => {
    expect(formatEvaluation(125, null)).toBe("+1.25");
    expect(formatEvaluation(-40, null)).toBe("-0.40");
  });

  it("preserves the mate direction", () => {
    expect(formatEvaluation(null, 3)).toBe("M3");
    expect(formatEvaluation(null, -2)).toBe("-M2");
  });
});

describe("evaluationToWhitePercent", () => {
  it("uses the middle for an unavailable or equal evaluation", () => {
    expect(evaluationToWhitePercent(null, null)).toBe(50);
    expect(evaluationToWhitePercent(0, null)).toBe(50);
  });

  it("caps decisive evaluations so both colors remain visible", () => {
    expect(evaluationToWhitePercent(100_000, null)).toBe(97);
    expect(evaluationToWhitePercent(-100_000, null)).toBe(3);
  });
});

describe("formatProbability", () => {
  it("formats a model probability without fake precision", () => {
    expect(formatProbability(0.456)).toBe("46%");
    expect(formatProbability(null)).toBe("—");
  });
});

describe("formatPlanHint", () => {
  it("turns evidence tags into concise Portuguese labels", () => {
    expect(formatPlanHint("secure_king")).toBe("colocar o rei em segurança");
    expect(formatPlanHint("advance_passed_pawn")).toBe("avançar o peão passado");
    expect(formatPlanHint("fork_pieces")).toBe("atacar duas peças ao mesmo tempo");
    expect(formatPlanHint("deliver_checkmate")).toBe("finalizar com xeque-mate");
  });

  it("includes deterministic target squares for tactical motifs", () => {
    const facts = {
      is_capture: false,
      captured_piece: null,
      gives_check: true,
      gives_checkmate: false,
      fork_targets: ["d7", "f7"],
      newly_pinned_targets: ["c6"],
      newly_attacked_undefended_targets: ["d6"],
      is_castling: false,
      promotion_piece: null,
      develops_minor_piece: false,
      occupies_center: false,
      moves_passed_pawn: false,
      creates_passed_pawn: false,
      improves_pawn_shield: false,
    };

    expect(formatPlanHint("fork_pieces", facts)).toBe("garfo em d7 e f7");
    expect(formatPlanHint("pin_piece", facts)).toBe("cravar c6 contra o rei");
    expect(formatPlanHint("attack_loose_piece", facts)).toBe("atacar d6 sem defesa");
  });
});
