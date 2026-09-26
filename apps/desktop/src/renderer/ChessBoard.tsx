import bB from "./assets/pieces/chessnut/bB.svg";
import bK from "./assets/pieces/chessnut/bK.svg";
import bN from "./assets/pieces/chessnut/bN.svg";
import bP from "./assets/pieces/chessnut/bP.svg";
import bQ from "./assets/pieces/chessnut/bQ.svg";
import bR from "./assets/pieces/chessnut/bR.svg";
import wB from "./assets/pieces/chessnut/wB.svg";
import wK from "./assets/pieces/chessnut/wK.svg";
import wN from "./assets/pieces/chessnut/wN.svg";
import wP from "./assets/pieces/chessnut/wP.svg";
import wQ from "./assets/pieces/chessnut/wQ.svg";
import wR from "./assets/pieces/chessnut/wR.svg";

type Orientation = "white" | "black";

type ParsedPiece = {
  color: "white" | "black";
  asset: string;
  name: string;
};

const PIECES: Record<string, ParsedPiece> = {
  K: { color: "white", asset: wK, name: "rei branco" },
  Q: { color: "white", asset: wQ, name: "dama branca" },
  R: { color: "white", asset: wR, name: "torre branca" },
  B: { color: "white", asset: wB, name: "bispo branco" },
  N: { color: "white", asset: wN, name: "cavalo branco" },
  P: { color: "white", asset: wP, name: "peão branco" },
  k: { color: "black", asset: bK, name: "rei preto" },
  q: { color: "black", asset: bQ, name: "dama preta" },
  r: { color: "black", asset: bR, name: "torre preta" },
  b: { color: "black", asset: bB, name: "bispo preto" },
  n: { color: "black", asset: bN, name: "cavalo preto" },
  p: { color: "black", asset: bP, name: "peão preto" },
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

export function parseFenPlacement(fen: string): Map<string, ParsedPiece> {
  const placement = fen.trim().split(/\s+/)[0] ?? "";
  const ranks = placement.split("/");
  if (ranks.length !== 8) throw new Error("FEN precisa conter oito fileiras");

  const pieces = new Map<string, ParsedPiece>();
  ranks.forEach((rank, rankIndex) => {
    let fileIndex = 0;
    for (const token of rank) {
      if (/^[1-8]$/.test(token)) {
        fileIndex += Number(token);
        continue;
      }
      const piece = PIECES[token];
      if (!piece || fileIndex > 7) throw new Error("Posição FEN inválida");
      pieces.set(`${FILES[fileIndex]}${8 - rankIndex}`, piece);
      fileIndex += 1;
    }
    if (fileIndex !== 8) throw new Error("Fileira FEN incompleta");
  });
  return pieces;
}

export function arrowCoordinates(uci: string | null, orientation: Orientation) {
  if (!uci || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  const point = (square: string) => {
    const file = FILES.indexOf(square.charAt(0));
    const rank = Number(square.charAt(1)) - 1;
    const column = orientation === "white" ? file : 7 - file;
    const row = orientation === "white" ? 7 - rank : rank;
    return { x: (column + 0.5) * 12.5, y: (row + 0.5) * 12.5 };
  };
  return { from: point(uci.slice(0, 2)), to: point(uci.slice(2, 4)) };
}

export function ChessBoard({
  fen,
  orientation,
  moveUci,
}: {
  fen: string;
  orientation: Orientation;
  moveUci: string | null;
}) {
  let pieces: Map<string, ParsedPiece>;
  let invalid = false;
  try {
    pieces = parseFenPlacement(fen);
  } catch {
    pieces = new Map();
    invalid = true;
  }

  const files = orientation === "white" ? FILES : [...FILES].reverse();
  const ranks = orientation === "white"
    ? [8, 7, 6, 5, 4, 3, 2, 1]
    : [1, 2, 3, 4, 5, 6, 7, 8];
  const fromSquare = moveUci?.slice(0, 2);
  const toSquare = moveUci?.slice(2, 4);
  const arrow = arrowCoordinates(moveUci, orientation);

  return (
    <div
      className={`chessboard${invalid ? " chessboard--invalid" : ""}`}
      role="img"
      aria-label={invalid ? "Posição FEN inválida" : "Tabuleiro da posição atual"}
      data-testid="chessboard"
    >
      {ranks.flatMap((rank, row) =>
        files.map((file, column) => {
          const square = `${file}${rank}`;
          const piece = pieces.get(square);
          const isLight = (FILES.indexOf(file) + rank) % 2 === 1;
          return (
            <div
              aria-hidden="true"
              className={[
                "chessboard__square",
                isLight ? "chessboard__square--light" : "chessboard__square--dark",
                square === fromSquare ? "chessboard__square--from" : "",
                square === toSquare ? "chessboard__square--to" : "",
              ].filter(Boolean).join(" ")}
              data-square={square}
              key={square}
            >
              {column === 0 && <small className="chessboard__rank">{rank}</small>}
              {row === 7 && <small className="chessboard__file">{file}</small>}
              {piece && (
                <img
                  alt=""
                  aria-label={piece.name}
                  className={`chessboard__piece chessboard__piece--${piece.color}`}
                  draggable={false}
                  src={piece.asset}
                />
              )}
            </div>
          );
        }),
      )}
      {arrow && (
        <svg className="chessboard__arrow" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <marker
              id="candidate-arrowhead"
              markerHeight="4"
              markerWidth="4"
              orient="auto"
              refX="2.8"
              refY="2"
            >
              <path d="M0,0 L0,4 L4,2 z" />
            </marker>
          </defs>
          <line
            x1={arrow.from.x}
            y1={arrow.from.y}
            x2={arrow.to.x}
            y2={arrow.to.y}
            markerEnd="url(#candidate-arrowhead)"
          />
        </svg>
      )}
      {invalid && <div className="chessboard__error">Confira a FEN para visualizar o tabuleiro</div>}
    </div>
  );
}
