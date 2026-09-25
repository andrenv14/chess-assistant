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
let desktopSocket;
let extensionSocket;
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

  desktopSocket = await openSocket("ws://127.0.0.1:8765/ws/desktop");
  desktopSocket.send("ready");
  extensionSocket = await openSocket("ws://127.0.0.1:8765/ws/extension");
  const event = {
    type: "position",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    source: "manual",
    at: new Date().toISOString(),
  };
  const desktopMessage = nextJsonMessage(desktopSocket, "desktop position event");
  const extensionAck = nextJsonMessage(extensionSocket, "extension acknowledgement");
  extensionSocket.send(JSON.stringify(event));
  const [forwarded, acknowledgement] = await Promise.all([desktopMessage, extensionAck]);
  if (JSON.stringify(forwarded) !== JSON.stringify(event)) {
    throw new Error("The desktop WebSocket received a different browser event.");
  }
  if (acknowledgement.type !== "ack" || acknowledgement.at !== event.at) {
    throw new Error("The extension WebSocket did not receive the expected acknowledgement.");
  }

  console.log(
    JSON.stringify({
      event: "desktop_backend_smoke_passed",
      owned_process: controller.owned,
      stockfish_available: health.stockfish_available,
      storage_available: health.storage_available,
      websocket_bridge: true,
    }),
  );
} finally {
  desktopSocket?.close();
  extensionSocket?.close();
  await controller?.stop();
  await rm(dataDirectory, { recursive: true, force: true });
}

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`WebSocket connection timed out: ${url}`));
    }, 3_000);
    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timeout);
        resolve(socket);
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error(`WebSocket connection failed: ${url}`));
      },
      { once: true },
    );
  });
}

function nextJsonMessage(socket, label) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${label}.`)), 3_000);
    socket.addEventListener(
      "message",
      (message) => {
        clearTimeout(timeout);
        try {
          resolve(JSON.parse(String(message.data)));
        } catch (error) {
          reject(new Error(`Received invalid JSON for ${label}.`, { cause: error }));
        }
      },
      { once: true },
    );
  });
}
