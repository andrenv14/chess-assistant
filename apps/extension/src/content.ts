import type { BrowserEvent } from "@chess-assistant/contracts";

import { findFen } from "./fen";

type Source = "lichess-analysis" | "chesscom-analysis";

const source: Source = location.hostname.includes("lichess")
  ? "lichess-analysis"
  : "chesscom-analysis";

function publishPosition(): void {
  const fen = findFen();
  if (!fen || fen === lastFen) return;
  lastFen = fen;
  const event: BrowserEvent = { type: "position", fen, source, at: new Date().toISOString() };
  void chrome.runtime.sendMessage(event);
}
let lastFen: string | null = null;

const observer = new MutationObserver(publishPosition);
observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
publishPosition();
