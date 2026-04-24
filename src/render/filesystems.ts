import stringWidth from 'string-width';
import type {
  DiskReport,
  Filesystem,
  RenderOptions,
  SortField,
} from '../model.js';
import { formatInUnit, pickColumnUnit } from './unit.js';
import { colorize } from './color.js';
import { renderBar } from './bar.js';
import { computeBarWidth, truncateMiddle } from './width.js';

const HEADER = 'FILESYSTEMS';
const COLUMN_GAP = '  ';

interface Cell {
  text: string;
  align: 'left' | 'right';
}

function padCell(cell: Cell, width: number): string {
  const w = stringWidth(cell.text);
  if (w >= width) return cell.text;
  const pad = ' '.repeat(width - w);
  return cell.align === 'left' ? cell.text + pad : pad + cell.text;
}

function ratio(f: Filesystem): number {
  return f.sizeBytes === 0 ? 0 : f.usedBytes / f.sizeBytes;
}

function compareBy(sort: SortField, a: Filesystem, b: Filesystem): number {
  switch (sort) {
    case 'size':
      return b.sizeBytes - a.sizeBytes;
    case 'used':
      return b.usedBytes - a.usedBytes;
    case 'free':
      return b.freeBytes - a.freeBytes;
    case 'use%':
      return ratio(b) - ratio(a);
    case 'name':
      return a.mountpoint.localeCompare(b.mountpoint);
  }
}

export function renderFilesystems(
  report: DiskReport,
  opts: RenderOptions,
): string {
  let rows = report.filesystems;
  if (!opts.showAll) rows = rows.filter((f) => !f.isPseudo);
  if (rows.length === 0) return '';

  rows = [...rows].sort((a, b) => compareBy(opts.sort, a, b));

  const sizeUnit = pickColumnUnit(rows.map((f) => f.sizeBytes), opts.base);
  const usedUnit = pickColumnUnit(rows.map((f) => f.usedBytes), opts.base);
  const freeUnit = pickColumnUnit(rows.map((f) => f.freeBytes), opts.base);

  // Rough mount column budget: 30% of width, min 12 cols.
  const mountBudget = Math.max(12, Math.floor(opts.width * 0.3));

  const cells: Cell[][] = rows.map((f) => {
    const r = ratio(f);
    const usePct = `${Math.round(r * 100)}%`;
    return [
      { text: truncateMiddle(f.mountpoint, mountBudget), align: 'left' },
      { text: f.device, align: 'left' },
      { text: f.fstype, align: 'left' },
      { text: formatInUnit(f.sizeBytes, sizeUnit, opts.base), align: 'right' },
      { text: formatInUnit(f.usedBytes, usedUnit, opts.base), align: 'right' },
      { text: formatInUnit(f.freeBytes, freeUnit, opts.base), align: 'right' },
      { text: colorize(r, usePct, opts.useColor), align: 'right' },
    ];
  });

  const headers: Cell[] = [
    { text: 'MOUNT', align: 'left' },
    { text: 'DEVICE', align: 'left' },
    { text: 'FSTYPE', align: 'left' },
    { text: `SIZE (${sizeUnit})`, align: 'right' },
    { text: `USED (${usedUnit})`, align: 'right' },
    { text: `FREE (${freeUnit})`, align: 'right' },
    { text: 'USE%', align: 'right' },
  ];

  // Truncate DEVICE col to keep lines readable; budget it to ~25% of width.
  const deviceBudget = Math.max(10, Math.floor(opts.width * 0.25));
  for (const row of cells) {
    row[1] = { ...row[1]!, text: truncateMiddle(row[1]!.text, deviceBudget) };
  }

  const widths = headers.map((h, i) =>
    Math.max(
      stringWidth(h.text),
      ...cells.map((row) => stringWidth(row[i]!.text)),
    ),
  );

  const fixedBudget =
    widths.reduce((a, b) => a + b, 0) + COLUMN_GAP.length * (widths.length - 1);

  const showBars = opts.showBars;
  const barWidth = showBars
    ? computeBarWidth(opts.width, fixedBudget + COLUMN_GAP.length)
    : 0;

  const lines: string[] = [HEADER];
  lines.push(
    headers.map((h, i) => padCell(h, widths[i]!)).join(COLUMN_GAP) +
      (showBars ? `${COLUMN_GAP}${'BAR'.padEnd(barWidth)}` : ''),
  );

  for (const [i, row] of cells.entries()) {
    const padded = row.map((c, j) => padCell(c, widths[j]!)).join(COLUMN_GAP);
    const f = rows[i]!;
    const bar = showBars
      ? `${COLUMN_GAP}${colorize(
          ratio(f),
          renderBar(ratio(f), barWidth, { unicode: opts.unicode }),
          opts.useColor,
        )}`
      : '';
    lines.push(padded + bar);
  }

  return lines.join('\n');
}
