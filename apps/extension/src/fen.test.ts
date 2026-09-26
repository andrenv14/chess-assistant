// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { findFen, isFen, PositionReader, sourceForHostname, sourceForLocation } from "./fen";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("isFen", () => {
  it("accepts a complete FEN and rejects arbitrary text", () => {
    expect(isFen(STARTING_FEN)).toBe(true);
    expect(isFen("this is not a position")).toBe(false);
  });

  it("rejects structurally incomplete boards and missing kings", () => {
    expect(isFen("8 w - - 0 1")).toBe(false);
    expect(isFen("8/8/8/8/8/8/8/8 w - - 0 1")).toBe(false);
    expect(isFen("9/8/8/8/8/8/8/K6k w - - 0 1")).toBe(false);
    expect(isFen("8/8/8/8/8/8/8/K6k w KK - 0 1")).toBe(false);
    expect(isFen("8/8/8/8/8/8/8/K6k w - - 0 0")).toBe(false);
  });
});

describe("findFen", () => {
  it("reads a FEN input exposed by an analysis page", () => {
    document.body.innerHTML = `<input aria-label="FEN" value="${STARTING_FEN}">`;
    expect(findFen()).toBe(STARTING_FEN);
  });

  it("falls back to a data-fen attribute", () => {
    document.body.innerHTML = `<div data-fen="${STARTING_FEN}"></div>`;
    expect(findFen()).toBe(STARTING_FEN);
  });

  it("reads the current Lichess value even when no value attribute exists", () => {
    document.body.innerHTML = `
      <main class="analyse">
        <div class="analyse__underboard"><div class="copyables"><div class="pair">
          <label class="name">FEN</label><input class="copyable">
        </div></div></div>
      </main>`;
    const input = document.querySelector<HTMLInputElement>("input.copyable")!;
    input.value = STARTING_FEN;

    expect(findFen(document, "lichess.org")).toBe(STARTING_FEN);
  });

  it("reads a FEN pasted into the Chess.com analysis loader", () => {
    document.body.innerHTML = `
      <input aria-label="Paste a PGN, FEN, or study link…"
             placeholder="Paste a PGN, FEN, or study link…">`;
    document.querySelector<HTMLInputElement>("input")!.value = STARTING_FEN;

    expect(findFen(document, "www.chess.com")).toBe(STARTING_FEN);
  });

  it("reads the live Chess.com engine-panel FEN after analysis loads", () => {
    const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
    document.body.innerHTML = `
      <div id="board-layout-analysis"></div>
      <div class="engine-lines-engine-lines-redesign engine-lines-with-options-lines"
           boardisflipped="true" fen="${afterE4}" selectedply="1"></div>`;

    expect(findFen(document, "www.chess.com")).toBe(afterE4);
  });

  it("rejects a non-FEN value from a Chess.com fen attribute", () => {
    document.body.innerHTML = `
      <div id="board-layout-analysis"><div fen="untrusted page text"></div></div>`;

    expect(findFen(document, "www.chess.com")).toBeNull();
  });
});

describe("sourceForHostname", () => {
  it("accepts only the two supported site families", () => {
    expect(sourceForHostname("lichess.org")).toBe("lichess-analysis");
    expect(sourceForHostname("www.chess.com")).toBe("chesscom-analysis");
    expect(sourceForHostname("notlichess.org")).toBeNull();
    expect(sourceForHostname("example.com")).toBeNull();
  });

  it("distinguishes analysis pages from playable live pages", () => {
    expect(sourceForLocation("www.chess.com", "/play/computer")).toBe("chesscom-live");
    expect(sourceForLocation("www.chess.com", "/play/online")).toBe("chesscom-live");
    expect(sourceForLocation("www.chess.com", "/game/live/123")).toBe("chesscom-live");
    expect(sourceForLocation("lichess.org", "/tv")).toBe("lichess-live");
    expect(sourceForLocation("lichess.org", "/a1B2c3D4/black")).toBe("lichess-live");
    expect(sourceForLocation("lichess.org", "/training")).toBeNull();
    expect(sourceForLocation("www.chess.com", "/news")).toBeNull();
  });
});

const PIECES: Record<string, string> = {
  a1: "R", b1: "N", c1: "B", d1: "Q", e1: "K", f1: "B", g1: "N", h1: "R",
  a2: "P", b2: "P", c2: "P", d2: "P", e2: "P", f2: "P", g2: "P", h2: "P",
  a7: "p", b7: "p", c7: "p", d7: "p", e7: "p", f7: "p", g7: "p", h7: "p",
  a8: "r", b8: "n", c8: "b", d8: "q", e8: "k", f8: "b", g8: "n", h8: "r",
};
const pieceName: Record<string, string> = {
  p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king",
};

function chessComBoard(pieces: Record<string, string>, lastMove: string[] = []): string {
  const pieceHtml = Object.entries(pieces).map(([square, piece]) => {
    const color = piece === piece.toUpperCase() ? "w" : "b";
    const file = "abcdefgh".indexOf(square[0]!) + 1;
    return `<div class="piece ${color}${piece.toLowerCase()} square-${file}${square[1]}"></div>`;
  }).join("");
  const highlights = lastMove.map((square) => {
    const file = "abcdefgh".indexOf(square[0]!) + 1;
    return `<div class="highlight square-${file}${square[1]}"></div>`;
  }).join("");
  return `<wc-chess-board class="board">${pieceHtml}${highlights}</wc-chess-board>`;
}

function lichessBoard(
  pieces: Record<string, string>,
  lastMove: string[] = [],
  orientation: "white" | "black" = "white",
): string {
  const transform = (square: string) => {
    const logicalFile = "abcdefgh".indexOf(square[0]!);
    const logicalRank = Number(square[1]);
    const x = orientation === "white" ? logicalFile : 7 - logicalFile;
    const y = orientation === "white" ? 8 - logicalRank : logicalRank - 1;
    return `translate(${x * 80}px, ${y * 80}px)`;
  };
  const pieceHtml = Object.entries(pieces).map(([square, piece]) => {
    const color = piece === piece.toUpperCase() ? "white" : "black";
    return `<piece class="${color} ${pieceName[piece.toLowerCase()]}" style="transform: ${transform(square)}"></piece>`;
  }).join("");
  const highlights = lastMove
    .map((square) => `<square class="last-move" style="transform: ${transform(square)}"></square>`)
    .join("");
  return `<div class="round__app__board"><div class="cg-wrap orientation-${orientation}"><cg-container style="width: 640px; height: 640px"><cg-board>${highlights}${pieceHtml}</cg-board></cg-container></div></div>`;
}

describe("PositionReader live boards", () => {
  it("reconstructs and legally tracks a Chess.com game position", () => {
    const reader = new PositionReader();
    document.body.innerHTML = chessComBoard(PIECES);
    expect(reader.read(document, "www.chess.com", "/play/computer")?.fen).toBe(STARTING_FEN);

    const afterE4 = { ...PIECES };
    delete afterE4.e2;
    afterE4.e4 = "P";
    document.body.innerHTML = chessComBoard(afterE4, ["e2", "e4"]);
    const position = reader.read(document, "www.chess.com", "/play/computer");

    expect(position?.source).toBe("chesscom-live");
    expect(position?.fen.split(" ").slice(0, 3)).toEqual([
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR",
      "b",
      "KQkq",
    ]);
  });

  it("reads the primary Lichess live board in either orientation", () => {
    for (const orientation of ["white", "black"] as const) {
      const reader = new PositionReader();
      document.body.innerHTML = lichessBoard(PIECES, [], orientation);
      const position = reader.read(document, "lichess.org", "/tv");
      expect(position).toEqual({ fen: STARTING_FEN, source: "lichess-live", orientation });
    }
  });

  it("infers the side to move when joining a game after a move", () => {
    const reader = new PositionReader();
    const afterE4 = { ...PIECES };
    delete afterE4.e2;
    afterE4.e4 = "P";
    document.body.innerHTML = lichessBoard(afterE4, ["e2", "e4"]);

    expect(reader.read(document, "lichess.org", "/a1B2c3D4")).toBeNull();
    const position = reader.read(document, "lichess.org", "/a1B2c3D4");
    expect(position?.fen.split(" ")[1]).toBe("b");
    expect(position?.fen.split(" ")[3]).toBe("e3");
  });
});
