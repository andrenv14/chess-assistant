import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ensureBackend } from "../dist-electron/backendProcess.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const backendDirectory = path.join(repositoryRoot, "backend");
const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "chess-assistant-smoke-"));
process.env.CHESS_ASSISTANT_DATA_DIR = dataDirectory;

let controller;
try {
  controller = await ensureBackend({ backendDirectory });
  if (!controller.owned) {
    throw new Error("A backend is already running; stop it before the lifecycle smoke test.");
  }
  const response = await fetch("http://127.0.0.1:8765/health");
  const health = await response.json();
  if (
    !response.ok ||
    health.service !== "chess-assistant-backend" ||
    health.status !== "ok" ||
    health.storage_available !== true
  ) {
    throw new Error(`Backend health check failed (${response.status}).`);
  }
  console.log(
    JSON.stringify({
      event: "desktop_backend_smoke_passed",
      owned_process: controller.owned,
      stockfish_available: health.stockfish_available,
      storage_available: health.storage_available,
    }),
  );
} finally {
  await controller?.stop();
  await rm(dataDirectory, { recursive: true, force: true });
}
