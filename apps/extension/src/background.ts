import { logEvent, type BrowserEvent } from "@chess-assistant/contracts";

import { isBrowserEvent, PositionBridge } from "./bridge";

const SOCKET_URL = "ws://127.0.0.1:8765/ws/extension";

const bridge = new PositionBridge({
  url: SOCKET_URL,
  onConnectionChange: (connected) => void chrome.storage.local.set({ connected }),
  log: (level, event) => logEvent(level, event, { component: "extension" }),
});

chrome.runtime.onMessage.addListener((message: unknown, _, reply) => {
  if (!isBrowserEvent(message)) {
    logEvent("warn", "browser_event_rejected", { component: "extension" });
    reply({ accepted: false });
    return false;
  }
  bridge.send(message);
  reply({ accepted: true });
  return false;
});

bridge.start();
