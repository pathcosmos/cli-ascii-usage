import { createColors } from 'picocolors';

// Force-enable ANSI inside picocolors; our own `useColor` flag gates emission.
// This avoids picocolors' TTY auto-detection disagreeing with our own.
const pc = createColors(true);

export const THRESHOLD_DANGER = 0.9;
export const THRESHOLD_WARN = 0.75;

export type ThresholdLevel = 'ok' | 'warn' | 'danger';

export function thresholdColor(ratio: number): ThresholdLevel {
  if (ratio >= THRESHOLD_DANGER) return 'danger';
  if (ratio >= THRESHOLD_WARN) return 'warn';
  return 'ok';
}

/**
 * Wrap `str` with an ANSI color when `useColor` is true and the ratio hits a
 * warn/danger threshold. When `useColor` is false, returns the string
 * byte-identically (no escapes) so `--no-color` output is pipe-safe.
 */
export function colorize(ratio: number, str: string, useColor: boolean): string {
  if (!useColor) return str;
  const level = thresholdColor(ratio);
  if (level === 'danger') return pc.red(str);
  if (level === 'warn') return pc.yellow(str);
  return str;
}
