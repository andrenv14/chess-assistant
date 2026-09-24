// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { findFen, isFen } from "./fen";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("isFen", () => {
  it("accepts a complete FEN and rejects arbitrary text", () => {
    expect(isFen(STARTING_FEN)).toBe(true);
    expect(isFen("this is not a position")).toBe(false);
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
});
