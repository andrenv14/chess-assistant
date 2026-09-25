// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

async function setup(sendMessage: ReturnType<typeof vi.fn>) {
  document.body.innerHTML = `
    <div id="status"></div>
    <textarea id="fen"></textarea>
    <button id="send">Enviar</button>
  `;
  vi.stubGlobal("chrome", {
    storage: { local: { get: vi.fn(async () => ({ connected: true })) } },
    runtime: { sendMessage },
  });
  await import("./popup");
  await vi.waitFor(() => expect(document.querySelector("#status")?.textContent).toBe("app local conectado"));
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("manual FEN popup", () => {
  it("rejects an invalid FEN before messaging the service worker", async () => {
    const sendMessage = vi.fn();
    await setup(sendMessage);
    const fen = document.querySelector<HTMLTextAreaElement>("#fen")!;
    fen.value = "not-a-fen";

    document.querySelector<HTMLButtonElement>("#send")!.click();

    expect(document.querySelector("#status")?.textContent).toBe("FEN inválida");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("reports service-worker acceptance without claiming backend delivery", async () => {
    const sendMessage = vi.fn(async () => ({ accepted: true }));
    await setup(sendMessage);
    const fen = document.querySelector<HTMLTextAreaElement>("#fen")!;
    fen.value = STARTING_FEN;

    document.querySelector<HTMLButtonElement>("#send")!.click();

    await vi.waitFor(() =>
      expect(document.querySelector("#status")?.textContent).toBe("posição enfileirada"),
    );
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "position", fen: STARTING_FEN, source: "manual" }),
    );
  });

  it("shows a transport failure", async () => {
    const sendMessage = vi.fn(async () => {
      throw new Error("service worker unavailable");
    });
    await setup(sendMessage);
    const fen = document.querySelector<HTMLTextAreaElement>("#fen")!;
    fen.value = STARTING_FEN;

    document.querySelector<HTMLButtonElement>("#send")!.click();

    await vi.waitFor(() =>
      expect(document.querySelector("#status")?.textContent).toBe("falha ao enviar posição"),
    );
  });
});
