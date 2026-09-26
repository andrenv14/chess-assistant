import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";

import { app, BrowserWindow, session } from "electron";

const root = path.resolve(import.meta.dirname, "..");
const backend = path.join(root, "backend", "dist", "chess-assistant-backend", "chess-assistant-backend.exe");
const extensionDirectory = path.join(root, "apps", "extension", "dist");
const data = await mkdtemp(path.join(os.tmpdir(), "chess-assistant-extension-"));
const fixturePort = 9241;
const receivedPositions = [];
let backendProcess;
let desktopSocket;
let loadedExtension;

const fixtureServer = createServer((request, response) => {
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  if (request.url === "/qa/lichess/analysis") {
    response.end(`<!doctype html><html><body>
      <main class="analyse__underboard"><div class="copyables"><div class="pair">
        <input class="copyable" value="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1">
      </div></div></main><cg-board></cg-board>
    </body></html>`);
    return;
  }
  if (request.url === "/qa/chesscom/analysis") {
    response.end(`<!doctype html><html><body><section id="board-layout-analysis">
      <div fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"></div>
      <wc-chess-board class="board"></wc-chess-board>
    </section></body></html>`);
    return;
  }
  response.statusCode = 404;
  response.end("not found");
});

async function waitFor(predicate, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function waitForSource(source) {
  await waitFor(
    () => receivedPositions.some((payload) => payload.source === source),
    `${source} snapshot`,
  );
  return receivedPositions.find((payload) => payload.source === source);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
}

async function run() {
  try {
    await new Promise((resolve, reject) => {
      fixtureServer.once("error", reject);
      fixtureServer.listen(fixturePort, "127.0.0.1", resolve);
    });
    backendProcess = spawn(backend, [], {
      cwd: path.dirname(backend),
      env: { ...process.env, LOCALAPPDATA: data },
      stdio: "ignore",
      windowsHide: true,
    });
    await waitFor(async () => {
      try { return (await fetch("http://127.0.0.1:8765/health")).ok; } catch { return false; }
    }, "packaged backend");

    desktopSocket = new WebSocket("ws://127.0.0.1:8765/ws/desktop");
    await new Promise((resolve, reject) => {
      desktopSocket.addEventListener("open", resolve, { once: true });
      desktopSocket.addEventListener("error", reject, { once: true });
    });
    desktopSocket.addEventListener("message", (event) => {
      const payload = JSON.parse(String(event.data));
      if (payload.type === "position") receivedPositions.push(payload);
    });

    loadedExtension = await session.defaultSession.extensions.loadExtension(extensionDirectory, {
      allowFileAccess: false,
    });
    const window = new BrowserWindow({
      width: 1100,
      height: 760,
      show: false,
      webPreferences: { backgroundThrottling: false, contextIsolation: true, sandbox: true },
    });
    await window.loadURL(`http://127.0.0.1:${fixturePort}/qa/lichess/analysis`);
    const lichess = await waitForSource("lichess-analysis");
    await window.loadURL(`http://127.0.0.1:${fixturePort}/qa/chesscom/analysis`);
    const chesscom = await waitForSource("chesscom-analysis");
    window.destroy();
    console.log(
      `Installed extension ${loadedExtension.version} OK: Lichess ${lichess.fen}; Chess.com ${chesscom.fen}.`,
    );
  } finally {
    desktopSocket?.close();
    if (loadedExtension) session.defaultSession.extensions.removeExtension(loadedExtension.id);
    await new Promise((resolve) => fixtureServer.close(resolve));
    await stopProcess(backendProcess);
    await rm(data, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
    app.quit();
  }
}

app.whenReady().then(run).catch((error) => {
  console.error(error);
  process.exitCode = 1;
  app.quit();
});
