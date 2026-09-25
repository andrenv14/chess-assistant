// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

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
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((message: MessageEvent) => void) | null = null;

  constructor(_url: string) {}

  send(): void {}
  close(): void {}
}

let root: Root | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("WebSocket", FakeWebSocket);
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
});
