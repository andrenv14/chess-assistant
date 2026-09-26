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

if (![1, 1.5].includes(scale)) throw new Error("CHESS_ASSISTANT_QA_SCALE must be 1 or 1.5");
app.commandLine.appendSwitch("force-device-scale-factor", String(scale));

await mkdir(output, { recursive: true });
await mkdir(qaData, { recursive: true });

const backendProcess = spawn(backend, [], {
  cwd: path.dirname(backend),
  env: { ...process.env, LOCALAPPDATA: qaData },
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

async function clickText(window, text) {
  const clicked = await window.webContents.executeJavaScript(`
    (() => {
      const target = [...document.querySelectorAll('button')]
        .find((button) => button.textContent?.includes(${JSON.stringify(text)}));
      if (!target) return false;
      target.click();
      return true;
    })()
  `);
  if (!clicked) throw new Error(`Button not found: ${text}`);
}

async function capture(window, name) {
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  window.webContents.invalidate();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const image = await window.webContents.capturePage();
  await writeFile(path.join(output, `${name}-${suffix}.png`), image.toPNG());
}

async function run() {
 try {
  await waitFor(async () => {
    try {
      return (await fetch("http://127.0.0.1:8765/health")).ok;
    } catch {
      return false;
    }
  }, "packaged backend health");
  console.log("Packaged backend is healthy.");

  const window = new BrowserWindow({
    width: 1440,
    height: 1000,
    show: false,
    backgroundColor: "#11130f",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  await window.loadFile(renderer);
  await waitFor(
    () => window.webContents.executeJavaScript("document.body.innerText.includes('Analisar agora')"),
    "renderer",
  );
  console.log("Renderer loaded; requesting Stockfish analysis.");
  await clickText(window, "Analisar agora");
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
  await capture(window, "01-analysis");

  await clickText(window, "Conhecimento");
  await waitFor(
    () => window.webContents.executeJavaScript("Boolean(document.querySelector('.knowledge-page'))"),
    "knowledge page",
  );
  await capture(window, "02-overview");
  for (const [button, file] of [["Tática", "03-tactics"], ["Estratégia", "04-strategy"], ["Final", "05-endgame"]]) {
    await clickText(window, button);
    await capture(window, file);
  }
  window.destroy();
  console.log(`Portfolio screenshots captured at ${suffix}% scale.`);
  } finally {
    await stopProcess(backendProcess);
    await rm(qaData, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
    app.quit();
  }
}

app.whenReady().then(run).catch((error) => {
  console.error(error);
  process.exitCode = 1;
  app.quit();
});
