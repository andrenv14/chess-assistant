// @vitest-environment jsdom

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { arrowCoordinates, ChessBoard, parseFenPlacement } from "./ChessBoard";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
let root: Root | null = null;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.querySelector("#root")!);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
});

describe("ChessBoard", () => {
  it("parses all pieces and their exact starting squares", () => {
    const pieces = parseFenPlacement(STARTING_FEN);

    expect(pieces).toHaveLength(32);
    expect(pieces.get("e1")).toEqual({ color: "white", symbol: "♔" });
    expect(pieces.get("d8")).toEqual({ color: "black", symbol: "♛" });
  });

  it("maps a candidate arrow in both orientations", () => {
    expect(arrowCoordinates("e2e4", "white")).toEqual({
      from: { x: 56.25, y: 81.25 },
      to: { x: 56.25, y: 56.25 },
    });
    expect(arrowCoordinates("e2e4", "black")).toEqual({
      from: { x: 43.75, y: 18.75 },
      to: { x: 43.75, y: 43.75 },
    });
  });

  it("renders move highlights and a safe invalid-position state", async () => {
    await act(async () =>
      root?.render(<ChessBoard fen={STARTING_FEN} orientation="white" moveUci="e2e4" />),
    );

    expect(document.querySelector('[data-square="e2"]')?.classList).toContain(
      "chessboard__square--from",
    );
    expect(document.querySelector('[data-square="e4"]')?.classList).toContain(
      "chessboard__square--to",
    );
    expect(document.querySelector(".chessboard__arrow")).not.toBeNull();

    await act(async () =>
      root?.render(<ChessBoard fen="not-a-fen" orientation="white" moveUci={null} />),
    );
    expect(document.querySelector('[aria-label="Posição FEN inválida"]')).not.toBeNull();
  });
});
