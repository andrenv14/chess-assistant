import { EventEmitter } from "node:events";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  ensureBackend,
  isBackendReady,
  resolveBackendInvocation,
  resolvePythonPath,
} from "./backendProcess.js";

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    kill: ReturnType<typeof vi.fn>;
    stdout: null;
    stderr: null;
  };
  child.exitCode = null;
  child.signalCode = null;
  child.kill = vi.fn(() => true);
  child.stdout = null;
  child.stderr = null;
  return child;
}

describe("isBackendReady", () => {
  it("accepts only the identified Chess Assistant health response", async () => {
    const validFetch = vi.fn(async () =>
      new Response(JSON.stringify({ status: "ok", service: "chess-assistant-backend" })),
    );
    const unrelatedFetch = vi.fn(async () => new Response(JSON.stringify({ status: "ok" })));

    await expect(isBackendReady("http://local/health", validFetch)).resolves.toBe(true);
    await expect(isBackendReady("http://local/health", unrelatedFetch)).resolves.toBe(false);
  });
});

describe("ensureBackend", () => {
  it("reuses a verified process without taking ownership", async () => {
    const spawnProcess = vi.fn();

    const controller = await ensureBackend({
      backendDirectory: "backend",
      checkReady: async () => true,
      spawnProcess,
    });

    expect(controller.owned).toBe(false);
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("starts uvicorn and owns only the process it created", async () => {
    const child = fakeChild();
    const spawnProcess = vi.fn(() => child);
    let checks = 0;

    const controller = await ensureBackend({
      backendDirectory: "C:\\project\\backend",
      pythonPath: "python-custom",
      checkReady: async () => ++checks >= 3,
      spawnProcess,
      wait: async () => undefined,
    });

    expect(controller.owned).toBe(true);
    expect(spawnProcess).toHaveBeenCalledWith(
      "python-custom",
      expect.arrayContaining(["-m", "uvicorn", "app.main:app"]),
      expect.objectContaining({ cwd: "C:\\project\\backend", shell: false }),
    );

    const stopped = controller.stop();
    child.exitCode = 0;
    child.emit("exit", 0, null);
    await stopped;
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it("reports a child that exits before becoming healthy", async () => {
    const child = fakeChild();
    const spawnProcess = vi.fn(() => child);
    let checks = 0;

    await expect(
      ensureBackend({
        backendDirectory: "backend",
        checkReady: async () => {
          checks += 1;
          if (checks === 2) child.emit("exit", 1, null);
          return false;
        },
        spawnProcess,
        wait: async () => undefined,
      }),
    ).rejects.toThrow("code 1");
  });

  it("reports a Python startup error instead of leaving an unhandled event", async () => {
    const child = fakeChild();
    const spawnProcess = vi.fn(() => child);
    let checks = 0;

    await expect(
      ensureBackend({
        backendDirectory: "backend",
        checkReady: async () => {
          checks += 1;
          if (checks === 2) child.emit("error", new Error("python not found"));
          return false;
        },
        spawnProcess,
        wait: async () => undefined,
      }),
    ).rejects.toThrow("python not found");
  });

  it("kills a child that never becomes healthy", async () => {
    const child = fakeChild();

    await expect(
      ensureBackend({
        backendDirectory: "backend",
        timeoutMs: 1,
        pollIntervalMs: 1,
        checkReady: async () => false,
        spawnProcess: () => child,
        wait: async () => new Promise((resolve) => setTimeout(resolve, 2)),
      }),
    ).rejects.toThrow("não respondeu");
    expect(child.kill).toHaveBeenCalledOnce();
  });
});

describe("resolvePythonPath", () => {
  it("always honors an explicit runtime override", () => {
    expect(resolvePythonPath(path.join("project", "backend"), "custom-python")).toBe(
      "custom-python",
    );
  });
});

describe("resolveBackendInvocation", () => {
  it("runs the self-contained backend without Python arguments when packaged", () => {
    const invocation = resolveBackendInvocation(
      path.join("resources", "backend"),
      undefined,
      (candidate) => candidate.endsWith(
        process.platform === "win32"
          ? "chess-assistant-backend.exe"
          : "chess-assistant-backend",
      ),
    );

    expect(invocation.command).toContain("chess-assistant-backend");
    expect(invocation.args).toEqual([]);
  });

  it("keeps an explicit Python override for development and diagnosis", () => {
    const invocation = resolveBackendInvocation(
      "backend",
      "python-custom",
      () => true,
    );

    expect(invocation.command).toBe("python-custom");
    expect(invocation.args).toEqual(
      expect.arrayContaining(["-m", "uvicorn", "app.main:app"]),
    );
  });
});
