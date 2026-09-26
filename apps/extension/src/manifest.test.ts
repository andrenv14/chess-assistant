import { describe, expect, it } from "vitest";

import manifest from "../manifest.json";

describe("supported-site permissions", () => {
  it("injects across both sites so SPA navigation and live-game routes remain observable", () => {
    const matches = manifest.content_scripts[0]?.matches ?? [];

    expect(matches).toContain("https://lichess.org/*");
    expect(matches).toContain("https://www.chess.com/*");
    expect(matches).toContain("http://127.0.0.1/*");
  });

  it("declares only the local bridge and the two supported chess sites", () => {
    expect(manifest.host_permissions).toEqual([
      "http://127.0.0.1/*",
      "https://lichess.org/*",
      "https://www.chess.com/*",
    ]);
  });
});
