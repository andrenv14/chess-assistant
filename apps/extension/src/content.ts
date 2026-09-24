import type { BrowserEvent } from "@chess-assistant/contracts";

type Source = "lichess-analysis" | "chesscom-analysis";

const source: Source = location.hostname.includes("lichess")
  ? "lichess-analysis"
  : "chesscom-analysis";

function isFen(value: string): boolean {
  return /^[prnbqkPRNBQK1-8/]+\s[wb]\s(?:-|[KQkq]+)\s(?:-|[a-h][36])\s\d+\s\d+$/.test(
    value.trim(),
  );
}

function findFen(): string | null {
  const candidates = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input[aria-label*="FEN" i], textarea[aria-label*="FEN" i], input[value*="/"], textarea',
  );
  for (const candidate of candidates) {
    if (isFen(candidate.value)) return candidate.value.trim();
  }

  const fenElement = document.querySelector<HTMLElement>("[data-fen]");
  const dataFen = fenElement?.dataset.fen;
  return dataFen && isFen(dataFen) ? dataFen.trim() : null;
}

function publishPosition(): void {
  const fen = findFen();
  if (!fen || fen === lastFen) return;
  lastFen = fen;
  const event: BrowserEvent = { type: "position", fen, source, at: new Date().toISOString() };
  void chrome.runtime.sendMessage(event);
}

function squareAt(event: PointerEvent, board: Element): string | null {
  const bounds = board.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;
  const x = Math.floor(((event.clientX - bounds.left) / bounds.width) * 8);
  const y = Math.floor(((event.clientY - bounds.top) / bounds.height) * 8);
  if (x < 0 || x > 7 || y < 0 || y > 7) return null;
  const flipped = board.classList.contains("orientation-black") || board.classList.contains("flipped");
  const file = String.fromCharCode("a".charCodeAt(0) + (flipped ? 7 - x : x));
  const rank = flipped ? y + 1 : 8 - y;
  return `${file}${rank}`;
}

const boardSelector = "cg-board, wc-chess-board, .board-layout-chessboard, chess-board";
let pointerStart: string | null = null;
let lastFen: string | null = null;

document.addEventListener(
  "pointerdown",
  (event) => {
    const board = (event.target as Element).closest(boardSelector);
    pointerStart = board ? squareAt(event, board) : null;
  },
  true,
);

document.addEventListener(
  "pointerup",
  (event) => {
    const board = (event.target as Element).closest(boardSelector);
    const destination = board ? squareAt(event, board) : null;
    if (pointerStart && destination && pointerStart !== destination) {
      const message: BrowserEvent = {
        type: "candidate-move",
        uci: `${pointerStart}${destination}`,
        source,
        at: new Date().toISOString(),
      };
      void chrome.runtime.sendMessage(message);
    }
    pointerStart = null;
    setTimeout(publishPosition, 250);
  },
  true,
);

const observer = new MutationObserver(publishPosition);
observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
publishPosition();
