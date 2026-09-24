import type { BrowserEvent } from "@chess-assistant/contracts";

import { findFen, sourceForHostname } from "./fen";

const source = sourceForHostname(location.hostname);
let lastFen: string | null = null;

function publishPosition(): void {
  if (!source) return;
  const fen = findFen();
  if (!fen || fen === lastFen) return;
  lastFen = fen;
  const event: BrowserEvent = { type: "position", fen, source, at: new Date().toISOString() };
  void chrome.runtime.sendMessage(event);
}

const observer = new MutationObserver(publishPosition);
observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
document.addEventListener("input", publishPosition, true);
window.addEventListener("popstate", publishPosition);

// Lichess updates the input value property directly. DOM mutations normally
// accompany a move, but this poll guarantees delivery even if its renderer
// changes without mutating an observed attribute.
const pollTimer = window.setInterval(publishPosition, 500);
window.addEventListener(
  "pagehide",
  () => {
    window.clearInterval(pollTimer);
    observer.disconnect();
    document.removeEventListener("input", publishPosition, true);
    window.removeEventListener("popstate", publishPosition);
  },
  { once: true },
);
publishPosition();
