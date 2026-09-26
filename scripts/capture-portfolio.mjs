import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { app, BrowserWindow } from "electron";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "docs", "assets", "portfolio");
const qaData = path.join(root, ".qa", `portfolio-${process.pid}`);
const backend = path.join(root, "backend", "dist", "chess-assistant-backend", "chess-assistant-backend.exe");
const renderer = path.join(root, "apps", "desktop", "dist-renderer", "index.html");
const scale = Number(process.env.CHESS_ASSISTANT_QA_SCALE ?? "1");
const suffix = scale === 1.5 ? "150" : "100";
const backendPort = "18765";
const electronData = path.join(qaData, "electron");
const LONDON_FEN = "rnbq1rk1/pp3ppp/3bpn2/2pp4/3P4/4PNB1/PPPN1PPP/R2QKB1R w KQ - 0 7";
const TACTICAL_FEN = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";
const ENDGAME_FEN = "8/5pk1/6p1/3r4/7P/5KP1/3R4/8 w - - 0 35";

if (![1, 1.5].includes(scale)) throw new Error("CHESS_ASSISTANT_QA_SCALE must be 1 or 1.5");
app.commandLine.appendSwitch("force-device-scale-factor", String(scale));
// Keep Chromium caches inside the disposable QA directory and use software
// rendering so captures do not depend on a writable global Electron profile or
// a particular GPU driver on the host.
app.disableHardwareAcceleration();

await mkdir(output, { recursive: true });
await mkdir(qaData, { recursive: true });
await mkdir(electronData, { recursive: true });
app.setPath("userData", electronData);
app.setPath("cache", path.join(electronData, "cache"));

const backendProcess = spawn(backend, [], {
  cwd: path.dirname(backend),
  env: {
    ...process.env,
    LOCALAPPDATA: qaData,
    CHESS_ASSISTANT_PORT: backendPort,
  },
  stdio: "ignore",
  windowsHide: true,
});
console.log(`Starting portfolio QA at ${suffix}% scale.`);

async function waitFor(predicate, label, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function stopProcess(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
}

async function clickText(window, text, selector = "button") {
  const clicked = await window.webContents.executeJavaScript(`
    (() => {
      const target = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find((button) => button.textContent?.includes(${JSON.stringify(text)}));
      if (!target) return false;
      target.click();
      return true;
    })()
  `);
  if (!clicked) throw new Error(`Button not found: ${text}`);
}

async function openKnowledgeTab(window, text) {
  await clickText(window, "Conhecimento", ".app-pages button");
  await waitFor(
    () => window.webContents.executeJavaScript("Boolean(document.querySelector('.knowledge-page'))"),
    "knowledge page",
  );
  await clickText(window, text, ".knowledge-nav button");
  await waitFor(
    () => window.webContents.executeJavaScript(
      `document.querySelector('.knowledge-nav__active')?.textContent?.includes(${JSON.stringify(text)})`,
    ),
    `${text} knowledge tab`,
  );
}

async function capture(window, name) {
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  window.webContents.invalidate();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const image = await window.webContents.capturePage();
  await writeFile(path.join(output, `${name}-${suffix}.png`), image.toPNG());
}

async function analyzeFen(window, fen) {
  await window.webContents.executeJavaScript("window.scrollTo(0, 0)");
  const changed = await window.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector('#fen');
      if (!(input instanceof HTMLTextAreaElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(input, ${JSON.stringify(fen)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()
  `);
  if (!changed) throw new Error("FEN editor not found");
  await waitFor(
    () => window.webContents.executeJavaScript(
      `document.querySelector('[data-testid="chessboard"]')?.dataset.fen === ${JSON.stringify(fen)}`,
    ),
    "React position commit",
    5_000,
  );
  await clickText(window, "Analisar agora");
  await waitFor(
    () => window.webContents.executeJavaScript("document.body.innerText.includes('Calculando…')"),
    "analysis start",
    5_000,
  );
  await waitFor(
    () => window.webContents.executeJavaScript(
      "document.querySelectorAll('article.move').length >= 1 && !document.body.innerText.includes('Calculando…')",
    ),
    "completed Stockfish analysis",
    45_000,
  );
}

async function run() {
 let window;
 try {
  await waitFor(async () => {
    try {
      return (await fetch(`http://127.0.0.1:${backendPort}/health`)).ok;
    } catch {
      return false;
    }
  }, "packaged backend health");
  console.log("Packaged backend is healthy.");

  window = new BrowserWindow({
    width: 1440,
    height: 1000,
    // A visible, non-focusable window forces Chromium to commit every route's
    // compositor frame. Hidden windows can return an earlier loading frame from
    // capturePage even after the React DOM has reached the requested state.
    show: true,
    focusable: false,
    skipTaskbar: true,
    backgroundColor: "#11130f",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  await window.loadFile(renderer, { query: { backendPort } });
  await waitFor(
    () => window.webContents.executeJavaScript("document.body.innerText.includes('Analisar agora')"),
    "renderer",
  );
  console.log("Renderer loaded; requesting the London portfolio position.");
  await analyzeFen(window, LONDON_FEN);
  await waitFor(
    () => window.webContents.executeJavaScript("document.querySelectorAll('article.move').length >= 3 && !document.body.innerText.includes('Calculando…')"),
    "three Stockfish candidates",
    45_000,
  );
  console.log("Three candidates received; capturing pages.");
  console.log(await window.webContents.executeJavaScript(`JSON.stringify({
    candidates: document.querySelectorAll('article.move').length,
    heading: document.querySelector('.analysis-heading h2')?.textContent,
    busy: document.body.innerText.includes('Calculando…')
  })`));
  // Hidden BrowserWindows can retain the first compositor frame. A real React
  // route round-trip forces Chromium to paint the completed analysis state.
  await clickText(window, "Conhecimento");
  await clickText(window, "Análise");
  await waitFor(
    () => window.webContents.executeJavaScript("document.querySelectorAll('article.move').length >= 3"),
    "painted analysis page",
  );
  await waitFor(
    () => window.webContents.executeJavaScript(`
      document.querySelector('.evaluation-badge')?.textContent?.includes('Avaliador')
      && document.querySelector('.replies > span')?.textContent?.includes('Defesa calculada pelo perfil do oponente')
      && !document.querySelector('.replies__loading')
    `),
    "progressive evaluator and opponent defence",
  );
  await capture(window, "01-analysis");

  await openKnowledgeTab(window, "Visão geral");
  await capture(window, "02-overview");
  await clickText(window, "Análise", ".app-pages button");
  await analyzeFen(window, TACTICAL_FEN);
  await openKnowledgeTab(window, "Tática");
  await capture(window, "03-tactics");

  await clickText(window, "Análise", ".app-pages button");
  await analyzeFen(window, LONDON_FEN);
  await openKnowledgeTab(window, "Estratégia");
  const repertoireVisible = await window.webContents.executeJavaScript(`
    (() => {
      const target = document.querySelector('.repertoire-deep-dive');
      if (!target) return false;
      // The knowledge board is sticky. A small disposable footer lets the
      // strategy cards settle at the top instead of clipping their heading
      // when the repertoire card sits near the end of the document.
      document.body.style.paddingBottom = '75px';
      window.scrollTo({
        left: 0,
        top: target.getBoundingClientRect().top + window.scrollY - 16,
        behavior: 'instant',
      });
      return true;
    })()
  `);
  if (!repertoireVisible) throw new Error("London repertoire card not found");
  await capture(window, "04-strategy");

  await clickText(window, "Análise", ".app-pages button");
  await analyzeFen(window, ENDGAME_FEN);
  await openKnowledgeTab(window, "Final");
  await capture(window, "05-endgame");
  console.log(`Portfolio screenshots captured at ${suffix}% scale.`);
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    await stopProcess(backendProcess);
    // Chromium can keep its journal open until Electron has fully exited.
    // Cleanup is best-effort; a stale disposable QA directory must never keep
    // a verification run alive after all screenshots have been written.
    void rm(qaData, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 }).catch(() => undefined);
  }
}

app.whenReady().then(async () => {
  try {
    await run();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
