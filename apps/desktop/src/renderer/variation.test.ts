import { describe, expect, it } from "vitest";

import { buildVariationFrames, candidateGapLabel } from "./variation";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("buildVariationFrames", () => {
  it("creates a navigable board state for every legal engine move", () => {
    const frames = buildVariationFrames(START, ["e2e4", "e7e5", "g1f3"]);

    expect(frames.map((frame) => frame.san)).toEqual(["e4", "e5", "Nf3"]);
    expect(frames[0]!.fen.split(" ")[1]).toBe("b");
    expect(frames[2]!.uci).toBe("g1f3");
  });

  it("stops safely when a provider line contains an illegal move", () => {
    expect(buildVariationFrames(START, ["e2e4", "e2e5"])).toHaveLength(1);
  });
});

describe("candidateGapLabel", () => {
  it("compares candidates from the side-to-move perspective", () => {
    expect(candidateGapLabel(50, 20, "white")).toBe("0.30 atrás da principal");
    expect(candidateGapLabel(-50, -20, "black")).toBe("0.30 atrás da principal");
  });

  it("does not invent a comparison without centipawn scores", () => {
    expect(candidateGapLabel(null, 20, "white")).toBeNull();
  });
});
