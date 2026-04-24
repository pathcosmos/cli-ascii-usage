import stringWidth from 'string-width';

const ELLIPSIS = '…';

/**
 * Truncate a string to at most `maxCols` display columns, eliding the middle
 * with `…`. Uses display-width (handles CJK + combining marks) rather than
 * JS string length.
 */
export function truncateMiddle(input: string, maxCols: number): string {
  if (maxCols <= 0) return '';
  if (maxCols === 1) return stringWidth(input) <= 1 ? input : ELLIPSIS;
  if (stringWidth(input) <= maxCols) return input;

  const budget = maxCols - 1; // reserve 1 col for ellipsis
  const leftBudget = Math.ceil(budget / 2);
  const rightBudget = budget - leftBudget;

  const chars = [...input];
  let leftUsed = 0;
  let leftIdx = 0;
  while (leftIdx < chars.length) {
    const w = stringWidth(chars[leftIdx]!);
    if (leftUsed + w > leftBudget) break;
    leftUsed += w;
    leftIdx += 1;
  }

  let rightUsed = 0;
  let rightIdx = chars.length;
  while (rightIdx > leftIdx) {
    const w = stringWidth(chars[rightIdx - 1]!);
    if (rightUsed + w > rightBudget) break;
    rightUsed += w;
    rightIdx -= 1;
  }

  return chars.slice(0, leftIdx).join('') + ELLIPSIS + chars.slice(rightIdx).join('');
}

/**
 * Bar column width scaled by terminal width, clamped to a readable range.
 * fixedBudget is the sum of all non-bar column widths (including separators).
 */
export function computeBarWidth(termCols: number, fixedBudget: number): number {
  const raw = termCols - fixedBudget;
  return Math.max(10, Math.min(30, raw));
}

/**
 * Read the terminal column count from a hint, falling back to 80 when unknown
 * or invalid. Caller passes `process.stdout.columns` in the CLI layer.
 */
export function getTerminalWidth(cols: number | undefined): number {
  if (cols === undefined || cols <= 0) return 80;
  return cols;
}
