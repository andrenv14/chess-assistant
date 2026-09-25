import { app, BrowserWindow, dialog } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ensureBackend, type BackendController } from "./backendProcess.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
let backendController: BackendController | null = null;
let shutdownStarted = false;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#11130f",
    title: "Chess Assistant",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(directory, "preload.js"),
    },
  });

  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl) {
    void window.loadURL(developmentUrl);
  } else {
    void window.loadFile(path.join(directory, "../dist-renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  const backendDirectory = process.env.CHESS_ASSISTANT_BACKEND_DIR
    ? path.resolve(process.env.CHESS_ASSISTANT_BACKEND_DIR)
    : app.isPackaged
      ? path.join(process.resourcesPath, "backend")
      : path.resolve(directory, "../../../backend");

  try {
    backendController = await ensureBackend({
      backendDirectory,
      pythonPath: process.env.CHESS_ASSISTANT_PYTHON,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Falha desconhecida.";
    dialog.showErrorBox(
      "Não foi possível iniciar o Chess Assistant",
      `${detail}\n\nConfirme que o ambiente Python do backend foi instalado.`,
    );
  }

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", (event) => {
  if (shutdownStarted || !backendController?.owned) return;
  event.preventDefault();
  shutdownStarted = true;
  void backendController.stop().finally(() => app.quit());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
