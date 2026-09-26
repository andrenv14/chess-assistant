import type { BrowserEvent } from "@chess-assistant/contracts";

import { PositionReader } from "./fen";

const reader = new PositionReader();
let lastFen: string | null = null;
let lastSource: string | null = null;
let lastOrientation: "white" | "black" | null = null;

function publishPosition(): void {
  const position = reader.read();
  if (!position) return;
  if (
    position.fen === lastFen
    && position.source === lastSource
    && position.orientation === lastOrientation
  ) return;
  lastFen = position.fen;
  lastSource = position.source;
  lastOrientation = position.orientation;
  const event: BrowserEvent = {
    type: "position",
    fen: position.fen,
    orientation: position.orientation,
    source: position.source,
    at: new Date().toISOString(),
  };
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
