import { afterEach, describe, expect, it, vi } from "vitest";

import { explainPosition } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("explainPosition", () => {
  it("posts the analyzed position to the atomic explanation endpoint", async () => {
    const payload = {
      evidence: {
        analysis: { candidates: [] },
        position: {},
        candidates: [],
      },
      explanation: { position_summary: "Resumo", candidates: [] },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await explainPosition({
      fen: "test-fen",
      actor: "user",
      include_evaluator: true,
      include_replies: true,
    });

    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8765/api/explain",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          fen: "test-fen",
          actor: "user",
          include_evaluator: true,
          include_replies: true,
        }),
      }),
    );
  });

  it("surfaces the backend's safe error detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "LLM explanation was unavailable or invalid" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      explainPosition({
        fen: "test-fen",
        actor: "user",
        include_evaluator: true,
        include_replies: true,
      }),
    ).rejects.toThrow("LLM explanation was unavailable or invalid");
  });
});
