import { afterEach, describe, expect, it, vi } from "vitest";

import { logEvent } from "./logger";

afterEach(() => vi.restoreAllMocks());

describe("logEvent", () => {
  it("emits structured JSON with a stable event name", () => {
    const output = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logEvent("info", "socket_connected", { component: "extension" });

    expect(JSON.parse(output.mock.calls[0]![0] as string)).toMatchObject({
      level: "info",
      event: "socket_connected",
      component: "extension",
    });
  });

  it("redacts secrets and complete positions", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logEvent("error", "provider_failed", { apiKey: "secret", fen: "position" });

    expect(JSON.parse(output.mock.calls[0]![0] as string)).toMatchObject({
      apiKey: "[redacted]",
      fen: "[redacted]",
    });
  });
});
