// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { findFen, isFen, sourceForHostname } from "./fen";

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
      <textarea placeholder="Paste a PGN, FEN, or study link…"></textarea>`;
    document.querySelector<HTMLTextAreaElement>("textarea")!.value = STARTING_FEN;

    expect(findFen(document, "www.chess.com")).toBe(STARTING_FEN);
  });

  it("reads the live Chess.com engine-panel FEN after analysis loads", () => {
    const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
    document.body.innerHTML = `
      <div id="board-layout-analysis">
        <div class="engine-lines-engine-lines-redesign" fen="${afterE4}"></div>
      </div>`;

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
});
