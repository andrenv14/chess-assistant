// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MoveClassificationResponse } from "@chess-assistant/contracts";

import { App, classificationEvidenceText } from "./App";

const api = vi.hoisted(() => ({
  analyzeEvidence: vi.fn(),
  classifyMove: vi.fn(),
  clearAnalysisHistory: vi.fn(),
  explainPosition: vi.fn(),
  getAnalysisHistoryItem: vi.fn(),
  getSettings: vi.fn(),
  listAnalysisHistory: vi.fn(),
  predictHumanMoves: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("./api", () => ({ ...api, WS_BASE: "ws://127.0.0.1:8765" }));

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const PROFILE = {
  enabled: true,
  limit_strength: true,
  elo: 1700,
  skill_level: 8,
  move_time_ms: 500,
  depth: null,
  multipv: 3,
  threads: 1,
  hash_mb: 128,
};

class FakeWebSocket {
  static last: FakeWebSocket | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((message: MessageEvent) => void) | null = null;

  constructor(_url: string) {
    FakeWebSocket.last = this;
  }

  send(): void {}
  close(): void {}
}

let root: Root | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("WebSocket", FakeWebSocket);
  FakeWebSocket.last = null;
  api.getSettings.mockResolvedValue({
    stockfish_path: "stockfish",
    maia3_available: false,
    maia3_path: null,
    llm_configured: false,
    llm_model: null,
    profiles: {
      user: PROFILE,
      opponent: { ...PROFILE, elo: 1800, skill_level: 10 },
      evaluator: { ...PROFILE, elo: 3190, skill_level: 20, limit_strength: false },
    },
  });
  api.listAnalysisHistory.mockResolvedValue([
    {
      id: 7,
      created_at: "2026-09-25T05:00:00Z",
      fen: STARTING_FEN,
      actor: "user",
      evaluation_cp: 37,
      evaluation_mate: null,
      opening_eco: null,
      opening_name: null,
      candidate_san: ["Nf3", "e4", "d4"],
    },
  ]);
  api.getAnalysisHistoryItem.mockResolvedValue({
    analysis: {
      fen: STARTING_FEN,
      actor: "user",
      advisor_role: "user",
      reply_role: "opponent",
      evaluation_cp: 37,
      evaluation_mate: null,
      candidates: [],
      opening: null,
    },
    position: undefined,
    candidates: [],
  });
  api.updateSettings.mockImplementation(async (_role, profile) => profile);
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.querySelector("#root")!);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("App integration surface", () => {
  it("renders persisted profiles and restores deterministic history", async () => {
    await act(async () => root?.render(<App />));

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Nf3 · e4 · d4");
      expect(document.body.textContent).toContain("1700");
    });

    const historyItem = document.querySelector<HTMLButtonElement>(".history__item")!;
    await act(async () => historyItem.click());

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Análise restaurada do histórico local");
      expect(document.body.textContent).toContain("+0.37");
    });
    expect(api.getAnalysisHistoryItem).toHaveBeenCalledWith(7);
  });

  it("applies a changed engine strength without remounting", async () => {
    await act(async () => root?.render(<App />));
    await vi.waitFor(() => expect(document.querySelectorAll(".profile")).toHaveLength(3));

    const userProfile = document.querySelector<HTMLElement>(".profile")!;
    const elo = userProfile.querySelector<HTMLInputElement>('input[type="range"]')!;
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(elo, "1710");
      elo.dispatchEvent(new Event("input", { bubbles: true }));
      elo.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () =>
      userProfile.querySelector<HTMLButtonElement>("button")!.click(),
    );

    await vi.waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalledWith(
        "user",
        expect.objectContaining({ elo: 1710 }),
      );
      expect(document.body.textContent).toContain("Força de user salva e aplicada sem reiniciar");
    });
  });

  it("auto-analyzes a live browser position and previews selectable candidates", async () => {
    const liveFen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
    api.analyzeEvidence.mockResolvedValue({
      analysis: {
        fen: liveFen,
        actor: "user",
        advisor_role: "user",
        reply_role: "opponent",
        evaluation_cp: 24,
        evaluation_mate: null,
        opening: null,
        candidates: [
          {
            uci: "g1f3",
            san: "Nf3",
            score_cp: 24,
            mate: null,
            pv_uci: ["g1f3", "b8c6"],
            pv_san: ["Nf3", "Nc6"],
            replies: [],
          },
          {
            uci: "f1c4",
            san: "Bc4",
            score_cp: 18,
            mate: null,
            pv_uci: ["f1c4"],
            pv_san: ["Bc4"],
            replies: [],
          },
        ],
      },
      position: undefined,
      candidates: [],
    });

    await act(async () => root?.render(<App />));
    await vi.waitFor(() => expect(FakeWebSocket.last).not.toBeNull());

    await act(async () => {
      FakeWebSocket.last?.onmessage?.(
        new MessageEvent("message", {
          data: JSON.stringify({
            type: "position",
            fen: liveFen,
            source: "chesscom-live",
            at: "2026-09-25T12:00:00Z",
          }),
        }),
      );
    });

    await vi.waitFor(() => {
      expect(api.analyzeEvidence).toHaveBeenCalledWith(
        expect.objectContaining({ fen: liveFen, actor: "user" }),
      );
      expect(document.body.textContent).toContain("Chess.com ao vivo");
      expect(document.body.textContent).toContain("Nf3");
    });
    expect(document.querySelector('[data-square="g1"]')?.classList).toContain(
      "chessboard__square--from",
    );
    expect(document.querySelector('[data-square="f3"]')?.classList).toContain(
      "chessboard__square--to",
    );

    const variationMoves = document.querySelectorAll<HTMLButtonElement>(
      ".variation-explorer__moves button",
    );
    expect(variationMoves).toHaveLength(2);
    await act(async () => variationMoves[1]!.click());
    expect(document.querySelector('[data-square="b8"]')?.classList).toContain(
      "chessboard__square--from",
    );
    expect(document.querySelector('[data-square="c6"]')?.classList).toContain(
      "chessboard__square--to",
    );
    expect(document.body.textContent).toContain("Variante 2/2");

    const secondCandidate = Array.from(document.querySelectorAll<HTMLButtonElement>(".move__summary"))
      .find((button) => button.textContent?.includes("Bc4"));
    await act(async () => secondCandidate?.click());

    expect(document.querySelector('[data-square="f1"]')?.classList).toContain(
      "chessboard__square--from",
    );
    expect(document.querySelector('[data-square="c4"]')?.classList).toContain(
      "chessboard__square--to",
    );
  });

  it("runs the current position from the documented keyboard shortcut", async () => {
    api.analyzeEvidence.mockResolvedValue({
      analysis: {
        fen: STARTING_FEN,
        actor: "user",
        advisor_role: "user",
        reply_role: "opponent",
        evaluation_cp: 20,
        evaluation_mate: null,
        candidates: [],
        opening: null,
      },
      position: undefined,
      candidates: [],
    });
    await act(async () => root?.render(<App />));

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true }));
    });

    await vi.waitFor(() => {
      expect(api.analyzeEvidence).toHaveBeenCalledWith(
        expect.objectContaining({ fen: STARTING_FEN, actor: "user" }),
      );
      expect(document.body.textContent).toContain("Análise concluída");
    });
  });
});

describe("classification evidence copy", () => {
  const baseMove = {
    uci: "d3h7",
    san: "Bxh7+",
    best_move_uci: "d3h7",
    best_move_san: "Bxh7+",
    classification: "brilliant",
    label: "Brilhante",
    symbol: "!!",
    expected_points_before: 0.76,
    expected_points_after: 0.75,
    expected_points_loss: 0.01,
    evaluation_before_cp: 120,
    evaluation_before_mate: null,
    evaluation_after_cp: 115,
    evaluation_after_mate: null,
    opening: null,
    evidence: {
      rule: "brilliant_sacrifice",
      played_is_engine_best: true,
      sacrifice_detected: true,
      best_move_is_forcing: true,
      second_best_move_uci: "d3e2",
      second_best_move_san: "Be2",
      second_best_expected_points: 0.7,
      second_best_expected_points_loss: 0.06,
    },
  } satisfies MoveClassificationResponse;

  it("explains a brilliant label from deterministic sacrifice evidence", () => {
    expect(classificationEvidenceText(baseMove)).toContain("sacrifício real");
  });

  it("names the rejected alternative for a unique great move", () => {
    const greatMove: MoveClassificationResponse = {
      ...baseMove,
      classification: "great",
      label: "Ótimo",
      symbol: "!",
      evidence: {
        ...baseMove.evidence,
        rule: "unique_best_move",
        sacrifice_detected: false,
        second_best_expected_points_loss: 0.13,
      },
    };

    expect(classificationEvidenceText(greatMove)).toContain("Be2 perderia 13.0");
  });
});
