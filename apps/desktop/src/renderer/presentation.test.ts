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
  });
});
