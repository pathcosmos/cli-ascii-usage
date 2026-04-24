import stringWidth from 'string-width';
import type { DiskReport, PhysicalDisk, RenderOptions } from '../model.js';
import { formatInUnit, pickColumnUnit } from './unit.js';
import { colorize } from './color.js';
import { renderBar } from './bar.js';
import { computeBarWidth } from './width.js';

const HEADER = 'PHYSICAL DISKS';
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

function ratio(d: PhysicalDisk): number {
  return d.sizeBytes === 0 ? 0 : d.usedBytes / d.sizeBytes;
}

export function renderDisks(report: DiskReport, opts: RenderOptions): string {
  const { physicalDisks } = report;
  if (physicalDisks.length === 0) return '';

  const sizes = physicalDisks.map((d) => d.sizeBytes);
  const useds = physicalDisks.map((d) => d.usedBytes);
  const frees = physicalDisks.map((d) => d.freeBytes);
  const sizeUnit = pickColumnUnit(sizes, opts.base);
  const usedUnit = pickColumnUnit(useds, opts.base);
  const freeUnit = pickColumnUnit(frees, opts.base);

  const headers: Cell[] = [
    { text: 'ID', align: 'left' },
    { text: 'MODEL', align: 'left' },
    { text: `SIZE (${sizeUnit})`, align: 'right' },
    { text: `USED (${usedUnit})`, align: 'right' },
    { text: `FREE (${freeUnit})`, align: 'right' },
    { text: 'USE%', align: 'right' },
  ];

  const rows: Cell[][] = physicalDisks.map((d) => {
    const r = ratio(d);
    const usePct = `${Math.round(r * 100)}%`;
    return [
      { text: d.id, align: 'left' },
      { text: d.model ?? '-', align: 'left' },
      { text: formatInUnit(d.sizeBytes, sizeUnit, opts.base), align: 'right' },
      { text: formatInUnit(d.usedBytes, usedUnit, opts.base), align: 'right' },
      { text: formatInUnit(d.freeBytes, freeUnit, opts.base), align: 'right' },
      { text: colorize(r, usePct, opts.useColor), align: 'right' },
    ];
  });

  const widths = headers.map((h, i) =>
    Math.max(
      stringWidth(h.text),
      ...rows.map((row) => stringWidth(row[i]!.text)),
    ),
  );

  const fixedBudget =
    widths.reduce((a, b) => a + b, 0) + COLUMN_GAP.length * (widths.length - 1);

  const showBars = opts.showBars;
  const barWidth = showBars
    ? computeBarWidth(opts.width, fixedBudget + COLUMN_GAP.length)
    : 0;

  const lines: string[] = [];
  lines.push(HEADER);
  lines.push(
    headers.map((h, i) => padCell(h, widths[i]!)).join(COLUMN_GAP) +
      (showBars ? `${COLUMN_GAP}${'BAR'.padEnd(barWidth)}` : ''),
  );

  for (const [i, row] of rows.entries()) {
    const padded = row.map((c, j) => padCell(c, widths[j]!)).join(COLUMN_GAP);
    const bar = showBars
      ? `${COLUMN_GAP}${colorize(
          ratio(physicalDisks[i]!),
          renderBar(ratio(physicalDisks[i]!), barWidth, { unicode: opts.unicode }),
          opts.useColor,
        )}`
      : '';
    lines.push(padded + bar);
  }

  return lines.join('\n');
}
