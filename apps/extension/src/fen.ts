import { Chess } from "chess.js";

const FILES = "abcdefgh";
const STARTING_PLACEMENT = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

export function isFen(value: string): boolean {
  const fields = value.trim().split(/\s+/);
  if (fields.length !== 6) return false;
  const [placement, turn, castling, enPassant, halfmove, fullmove] = fields;
  if (!placement || !turn || !castling || !enPassant || !halfmove || !fullmove) return false;

  const ranks = placement.split("/");
  if (ranks.length !== 8) return false;
  let whiteKings = 0;
  let blackKings = 0;
  for (const rank of ranks) {
    let files = 0;
    for (const token of rank) {
      if (/^[1-8]$/.test(token)) files += Number(token);
      else if (/^[prnbqkPRNBQK]$/.test(token)) {
        files += 1;
        if (token === "K") whiteKings += 1;
        if (token === "k") blackKings += 1;
      } else return false;
    }
    if (files !== 8) return false;
  }

  return (
    whiteKings === 1 &&
    blackKings === 1 &&
    /^[wb]$/.test(turn) &&
    /^(?:-|K?Q?k?q?)$/.test(castling) &&
    /^(?:-|[a-h][36])$/.test(enPassant) &&
    /^\d+$/.test(halfmove) &&
    /^\d+$/.test(fullmove) &&
    Number(fullmove) >= 1
  );
}

export type AnalysisSource =
  | "lichess-analysis"
  | "lichess-live"
  | "chesscom-analysis"
  | "chesscom-live";

const SITE_FEN_SELECTORS: Partial<Record<AnalysisSource, string[]>> = {
  "lichess-analysis": [
    ".analyse__underboard .copyables .pair input.copyable",
    ".analyse__underboard input.copyable",
  ],
  "chesscom-analysis": [
    "#board-layout-analysis [fen]",
    ".engine-lines-engine-lines-redesign[fen]",
    'textarea[placeholder*="PGN, FEN" i]',
    'textarea[aria-label*="FEN" i]',
    'input[aria-label*="FEN" i]',
  ],
};

export function sourceForLocation(hostname: string, pathname: string): AnalysisSource | null {
  const normalized = hostname.toLowerCase();
  if (normalized === "127.0.0.1" && pathname.startsWith("/qa/")) {
    if (pathname === "/qa/lichess/analysis") return "lichess-analysis";
    if (pathname === "/qa/chesscom/analysis") return "chesscom-analysis";
    return null;
  }
  if (normalized === "lichess.org" || normalized.endsWith(".lichess.org")) {
    if (/^\/(?:[a-z]{2}\/)?analysis(?:\/|$)/i.test(pathname)) return "lichess-analysis";
    const localizedPath = pathname.replace(/^\/[a-z]{2}(?=\/)/i, "");
    if (/^\/(?:tv|practice)(?:\/|$)/i.test(localizedPath)) return "lichess-live";
    const firstSegment = localizedPath.split("/").filter(Boolean)[0] ?? "";
    const reserved = new Set([
      "training", "learn", "player", "broadcast", "study", "editor", "login", "signup",
      "api", "account", "forum", "team", "appeal", "contact", "faq", "inbox", "coach",
      "streamer", "games", "opening", "features", "terms-of-service", "privacy",
    ]);
    if (/^[a-zA-Z0-9]{8,12}$/.test(firstSegment) && !reserved.has(firstSegment.toLowerCase())) {
      return "lichess-live";
    }
    return null;
  }
  if (normalized === "chess.com" || normalized.endsWith(".chess.com")) {
    if (/^\/analysis(?:\/|$)/i.test(pathname)) return "chesscom-analysis";
    if (/^\/(?:play|game)(?:\/|$)/i.test(pathname)) return "chesscom-live";
  }
  return null;
}

/** Compatibility helper for analysis-page fixtures and callers without a pathname. */
export function sourceForHostname(hostname: string): AnalysisSource | null {
  return sourceForLocation(hostname, "/analysis");
}

function elementFen(candidate: Element): string | null {
  const value =
    candidate instanceof HTMLInputElement || candidate instanceof HTMLTextAreaElement
      ? candidate.value
      : candidate.getAttribute("fen") ?? candidate.getAttribute("data-fen");
  return value && isFen(value) ? value.trim() : null;
}

function valueFromSelectors(root: ParentNode, selectors: string[]): string | null {
  for (const selector of selectors) {
    const candidates = root.querySelectorAll(selector);
    for (const candidate of candidates) {
      const fen = elementFen(candidate);
      if (fen) return fen;
    }
  }
  return null;
}

function directFen(root: ParentNode, source: AnalysisSource | null): string | null {
  if (source) {
    const siteFen = valueFromSelectors(root, SITE_FEN_SELECTORS[source] ?? []);
    if (siteFen) return siteFen;
  }

  const candidates = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input[aria-label*="FEN" i], textarea[aria-label*="FEN" i], input[value*="/"], textarea',
  );
  for (const candidate of candidates) {
    if (isFen(candidate.value)) return candidate.value.trim();
  }

  const fenElement = root.querySelector<HTMLElement>("[data-fen]");
  return fenElement ? elementFen(fenElement) : null;
}

export function findFen(
  root: ParentNode = document,
  hostname: string = location.hostname,
  pathname = "/analysis",
): string | null {
  return directFen(root, sourceForLocation(hostname, pathname));
}

interface BoardSnapshot {
  pieces: Map<string, string>;
  lastMoveSquares: string[];
}

function chessComSnapshot(root: ParentNode): BoardSnapshot | null {
  const board = root.querySelector("wc-chess-board.board, wc-chess-board, chess-board.board");
  if (!board) return null;
  const pieces = new Map<string, string>();
  for (const element of board.querySelectorAll(".piece")) {
    const tokens = [...element.classList];
    const pieceToken = tokens.find((token) => /^[wb][prnbqk]$/.test(token));
    const squareToken = tokens.find((token) => /^square-[1-8][1-8]$/.test(token));
    if (!pieceToken || !squareToken) continue;
    const file = Number(squareToken[7]) - 1;
    const rank = Number(squareToken[8]);
    const symbol = pieceToken[0] === "w" ? pieceToken[1]?.toUpperCase() : pieceToken[1];
    if (symbol) pieces.set(`${FILES[file]}${rank}`, symbol);
  }
  const lastMoveSquares = [...board.querySelectorAll(".highlight, .last-move")]
    .flatMap((element) => [...element.classList])
    .filter((token) => /^square-[1-8][1-8]$/.test(token))
    .map((token) => `${FILES[Number(token[7]) - 1]}${token[8]}`);
  return validSnapshot(pieces) ? { pieces, lastMoveSquares: [...new Set(lastMoveSquares)] } : null;
}

function translatedSquare(
  transform: string,
  squareSize: number,
  orientation: "white" | "black",
): string | null {
  const match = transform.match(/translate(?:3d)?\(\s*([\d.]+)px\s*,\s*([\d.]+)px/i);
  if (!match) return null;
  const x = Math.round(Number(match[1]) / squareSize);
  const y = Math.round(Number(match[2]) / squareSize);
  if (x < 0 || x > 7 || y < 0 || y > 7) return null;
  const file = orientation === "white" ? x : 7 - x;
  const rank = orientation === "white" ? 8 - y : y + 1;
  return `${FILES[file]}${rank}`;
}

function lichessSnapshot(root: ParentNode): BoardSnapshot | null {
  const wrap = root.querySelector<HTMLElement>(
    ".round__app__board .cg-wrap, .main-board.cg-wrap, .analyse__board .cg-wrap, .puzzle__board .cg-wrap",
  );
  const board = wrap?.querySelector("cg-board");
  if (!wrap || !board) return null;
  const container = board.parentElement as HTMLElement | null;
  const inlineWidth = Number.parseFloat(container?.style.width ?? "");
  const measuredWidth = container?.getBoundingClientRect().width ?? 0;
  const boardWidth = measuredWidth || inlineWidth;
  if (!Number.isFinite(boardWidth) || boardWidth <= 0) return null;
  const squareSize = boardWidth / 8;
  const orientation = wrap.classList.contains("orientation-black") ? "black" : "white";
  const pieces = new Map<string, string>();
  const pieceNames: Record<string, string> = {
    pawn: "p",
    knight: "n",
    bishop: "b",
    rook: "r",
    queen: "q",
    king: "k",
  };
  for (const element of board.querySelectorAll<HTMLElement>("piece")) {
    const color = element.classList.contains("white")
      ? "white"
      : element.classList.contains("black")
        ? "black"
        : null;
    const name = Object.keys(pieceNames).find((candidate) => element.classList.contains(candidate));
    const square = translatedSquare(element.style.transform, squareSize, orientation);
    if (!color || !name || !square) continue;
    const symbol = pieceNames[name]!;
    pieces.set(square, color === "white" ? symbol.toUpperCase() : symbol);
  }
  const lastMoveSquares = [...board.querySelectorAll<HTMLElement>("square.last-move")]
    .map((element) => translatedSquare(element.style.transform, squareSize, orientation))
    .filter((square): square is string => square !== null);
  return validSnapshot(pieces) ? { pieces, lastMoveSquares } : null;
}

function validSnapshot(pieces: Map<string, string>): boolean {
  return (
    [...pieces.values()].filter((piece) => piece === "K").length === 1 &&
    [...pieces.values()].filter((piece) => piece === "k").length === 1
  );
}

function placementFromPieces(pieces: Map<string, string>): string {
  const ranks: string[] = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    let row = "";
    let empty = 0;
    for (const file of FILES) {
      const piece = pieces.get(`${file}${rank}`);
      if (piece) {
        if (empty) row += String(empty);
        empty = 0;
        row += piece;
      } else empty += 1;
    }
    if (empty) row += String(empty);
    ranks.push(row);
  }
  return ranks.join("/");
}

function inferFreshFen(snapshot: BoardSnapshot): string {
  const placement = placementFromPieces(snapshot.pieces);
  let turn: "w" | "b" = "w";
  const occupiedLastMove = snapshot.lastMoveSquares.filter((square) => snapshot.pieces.has(square));
  if (placement !== STARTING_PLACEMENT && occupiedLastMove.length === 1) {
    const mover = snapshot.pieces.get(occupiedLastMove[0]!);
    if (mover) turn = mover === mover.toUpperCase() ? "b" : "w";
  }

  let castling = "";
  if (snapshot.pieces.get("e1") === "K") {
    if (snapshot.pieces.get("h1") === "R") castling += "K";
    if (snapshot.pieces.get("a1") === "R") castling += "Q";
  }
  if (snapshot.pieces.get("e8") === "k") {
    if (snapshot.pieces.get("h8") === "r") castling += "k";
    if (snapshot.pieces.get("a8") === "r") castling += "q";
  }

  let enPassant = "-";
  if (snapshot.lastMoveSquares.length === 2 && occupiedLastMove.length === 1) {
    const destination = occupiedLastMove[0]!;
    const origin = snapshot.lastMoveSquares.find((square) => square !== destination);
    const piece = snapshot.pieces.get(destination);
    if (origin && piece?.toLowerCase() === "p" && origin[0] === destination[0]) {
      const originRank = Number(origin[1]);
      const destinationRank = Number(destination[1]);
      if (Math.abs(originRank - destinationRank) === 2) {
        enPassant = `${destination[0]}${(originRank + destinationRank) / 2}`;
      }
    }
  }
  return `${placement} ${turn} ${castling || "-"} ${enPassant} 0 1`;
}

function legalSuccessor(previousFen: string, placement: string): string | null {
  try {
    const game = new Chess(previousFen);
    for (const move of game.moves({ verbose: true })) {
      const candidate = new Chess(previousFen);
      candidate.move(move);
      if (candidate.fen().split(" ")[0] === placement) return candidate.fen();
    }
  } catch {
    return null;
  }
  return null;
}

export class PositionReader {
  private previousFen: string | null = null;
  private previousSource: AnalysisSource | null = null;
  private pendingPlacement: string | null = null;

  read(
    root: ParentNode = document,
    hostname: string = location.hostname,
    pathname: string = location.pathname,
  ): { fen: string; source: AnalysisSource } | null {
    const source = sourceForLocation(hostname, pathname);
    if (!source) {
      this.reset();
      return null;
    }
    if (this.previousSource !== source) {
      this.previousFen = null;
      this.pendingPlacement = null;
    }
    this.previousSource = source;

    const exposedFen = directFen(root, source);
    if (exposedFen) {
      this.previousFen = exposedFen;
      this.pendingPlacement = null;
      return { fen: exposedFen, source };
    }

    const snapshot = source.startsWith("chesscom")
      ? chessComSnapshot(root)
      : lichessSnapshot(root);
    if (!snapshot) return null;
    const placement = placementFromPieces(snapshot.pieces);
    if (this.previousFen?.split(" ")[0] === placement) {
      this.pendingPlacement = null;
      return { fen: this.previousFen, source };
    }
    const tracked = this.previousFen ? legalSuccessor(this.previousFen, placement) : null;
    if (!tracked && placement !== STARTING_PLACEMENT && this.pendingPlacement !== placement) {
      // Site renderers briefly expose half-applied animation states. A fresh or
      // non-legal placement must remain stable for a second observation.
      this.pendingPlacement = placement;
      return null;
    }
    const fen = tracked ?? inferFreshFen(snapshot);
    if (!isFen(fen)) return null;
    this.previousFen = fen;
    this.pendingPlacement = null;
    return { fen, source };
  }

  reset(): void {
    this.previousFen = null;
    this.previousSource = null;
    this.pendingPlacement = null;
  }
}
