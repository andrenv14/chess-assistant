import type { BrowserEvent } from "@chess-assistant/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isBrowserEvent, PositionBridge } from "./bridge";

const FIRST: BrowserEvent = {
  type: "position",
  fen: "8/8/8/8/8/8/P7/K6k w - - 0 1",
  source: "lichess-analysis",
  at: "2026-09-25T05:00:00.000Z",
};
const SECOND: BrowserEvent = {
  ...FIRST,
  fen: "8/8/8/8/8/P7/8/K6k b - - 0 1",
  at: "2026-09-25T05:00:01.000Z",
};

class FakeSocket extends EventTarget {
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  acknowledge(at: string): void {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify({ type: "ack", at }) }));
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

function setupBridge() {
  const sockets: FakeSocket[] = [];
  const bridge = new PositionBridge({
    url: "ws://127.0.0.1:8765/ws/extension",
    reconnectDelayMs: 10,
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
  });
  return { bridge, sockets };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("PositionBridge", () => {
  it("sends only the newest position after a pending connection opens", () => {
    const { bridge, sockets } = setupBridge();
    bridge.send(FIRST);
    bridge.send(SECOND);

    sockets[0]!.open();

    expect(sockets[0]!.sent).toEqual([JSON.stringify(SECOND)]);
    bridge.dispose();
  });

  it("replays an unacknowledged position after reconnection", async () => {
    vi.useFakeTimers();
    const { bridge, sockets } = setupBridge();
    bridge.send(FIRST);
    sockets[0]!.open();
    sockets[0]!.close();

    await vi.advanceTimersByTimeAsync(10);
    sockets[1]!.open();

    expect(sockets[1]!.sent).toEqual([JSON.stringify(FIRST)]);
    bridge.dispose();
  });

  it("does not replay a position acknowledged by the backend", async () => {
    vi.useFakeTimers();
    const { bridge, sockets } = setupBridge();
    bridge.send(FIRST);
    sockets[0]!.open();
    sockets[0]!.acknowledge(FIRST.at);
    sockets[0]!.close();

    await vi.advanceTimersByTimeAsync(10);
    sockets[1]!.open();

    expect(sockets[1]!.sent).toEqual([]);
    bridge.dispose();
  });
});

describe("isBrowserEvent", () => {
  it("rejects malformed runtime messages", () => {
    expect(isBrowserEvent(FIRST)).toBe(true);
    expect(isBrowserEvent({ ...FIRST, source: "unknown" })).toBe(false);
    expect(isBrowserEvent({ ...FIRST, at: "not-a-date" })).toBe(false);
    expect(isBrowserEvent({ ...FIRST, fen: "not-a-fen" })).toBe(false);
    expect(isBrowserEvent({ type: "position" })).toBe(false);
  });
});
