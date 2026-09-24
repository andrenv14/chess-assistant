import { describe, expect, it } from "vitest";

import manifest from "../manifest.json";

describe("analysis page permissions", () => {
  it("injects on the bare and nested analysis URLs for both supported sites", () => {
    const matches = manifest.content_scripts[0]?.matches ?? [];

    expect(matches).toContain("https://lichess.org/analysis*");
    expect(matches).toContain("https://www.chess.com/analysis*");
  });

  it("does not request access to every page on either chess site", () => {
    const matches = manifest.content_scripts[0]?.matches ?? [];

    expect(matches).not.toContain("https://lichess.org/*");
    expect(matches).not.toContain("https://www.chess.com/*");
  });
});
