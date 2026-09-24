export function isFen(value: string): boolean {
  return /^[prnbqkPRNBQK1-8/]+\s[wb]\s(?:-|[KQkq]+)\s(?:-|[a-h][36])\s\d+\s\d+$/.test(
    value.trim(),
  );
}

export type AnalysisSource = "lichess-analysis" | "chesscom-analysis";

const SITE_FEN_SELECTORS: Record<AnalysisSource, string[]> = {
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

export function sourceForHostname(hostname: string): AnalysisSource | null {
  const normalized = hostname.toLowerCase();
  if (normalized === "lichess.org" || normalized.endsWith(".lichess.org")) {
    return "lichess-analysis";
  }
  if (normalized === "chess.com" || normalized.endsWith(".chess.com")) {
    return "chesscom-analysis";
  }
  return null;
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

export function findFen(
  root: ParentNode = document,
  hostname: string = location.hostname,
): string | null {
  const source = sourceForHostname(hostname);
  if (source) {
    const siteFen = valueFromSelectors(root, SITE_FEN_SELECTORS[source]);
    if (siteFen) return siteFen;
  }

  // This fallback supports sanitized fixtures and minor markup changes while
  // still accepting only a complete, validated FEN value.
  const candidates = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input[aria-label*="FEN" i], textarea[aria-label*="FEN" i], input[value*="/"], textarea',
  );
  for (const candidate of candidates) {
    if (isFen(candidate.value)) return candidate.value.trim();
  }

  const fenElement = root.querySelector<HTMLElement>("[data-fen]");
  return fenElement ? elementFen(fenElement) : null;
}
