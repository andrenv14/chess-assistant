import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("chessAssistant", {
  platform: process.platform,
  versions: process.versions,
});
