import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearAnalysisHistory,
  explainPosition,
  getAnalysisHistoryItem,
  listAnalysisHistory,
} from "./api";

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

describe("analysis history", () => {
  it("lists, restores and clears local history through explicit endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 7 }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ analysis: { fen: "test-fen" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deleted: 1 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await listAnalysisHistory(10);
    await getAnalysisHistoryItem(7);
    await clearAnalysisHistory();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:8765/api/history?limit=10",
      undefined,
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8765/api/history/7",
      undefined,
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://127.0.0.1:8765/api/history",
      { method: "DELETE" },
    );
  });
});
