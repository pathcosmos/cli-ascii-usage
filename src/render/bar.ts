export interface BarOptions {
  unicode: boolean;
}

function clamp01(r: number): number {
  if (Number.isNaN(r)) return 0;
  if (r < 0) return 0;
  if (r > 1) return 1;
  return r;
}

/**
 * Render a horizontal usage bar. Pure: no color, no env.
 * Unicode fill: █ (filled) + ▓ (empty). ASCII fallback: # + -.
 */
export function renderBar(ratio: number, width: number, opts: BarOptions): string {
  if (width <= 0) return '';
  const r = clamp01(ratio);
  const filled = Math.round(r * width);
  const empty = width - filled;
  const [fillChar, emptyChar] = opts.unicode ? ['█', '▓'] : ['#', '-'];
  return fillChar.repeat(filled) + emptyChar.repeat(empty);
}
