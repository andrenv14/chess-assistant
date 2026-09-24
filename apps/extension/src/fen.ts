export function isFen(value: string): boolean {
  return /^[prnbqkPRNBQK1-8/]+\s[wb]\s(?:-|[KQkq]+)\s(?:-|[a-h][36])\s\d+\s\d+$/.test(
    value.trim(),
  );
}

export function findFen(root: ParentNode = document): string | null {
  const candidates = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input[aria-label*="FEN" i], textarea[aria-label*="FEN" i], input[value*="/"], textarea',
  );
  for (const candidate of candidates) {
    if (isFen(candidate.value)) return candidate.value.trim();
  }

  const fenElement = root.querySelector<HTMLElement>("[data-fen]");
  const dataFen = fenElement?.dataset.fen;
  return dataFen && isFen(dataFen) ? dataFen.trim() : null;
}
