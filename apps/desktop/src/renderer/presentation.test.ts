import { describe, expect, it } from "vitest";

import { evaluationToWhitePercent, formatEvaluation } from "./presentation";

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
