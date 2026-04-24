import type { UnitBase } from '../model.js';

const IEC_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB'] as const;
const SI_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'] as const;

export type UnitLabel = (typeof IEC_UNITS)[number] | (typeof SI_UNITS)[number];

function unitTable(base: UnitBase): readonly UnitLabel[] {
  return base === 1024 ? IEC_UNITS : SI_UNITS;
}

function exponentFor(n: number, base: UnitBase): number {
  if (n <= 0) return 0;
  const e = Math.floor(Math.log(n) / Math.log(base));
  return Math.min(e, IEC_UNITS.length - 1);
}

export function formatBytes(n: number, base: UnitBase): string {
  const table = unitTable(base);
  const e = exponentFor(n, base);
  const unit = table[e] ?? table[0]!;
  if (e === 0) return `${Math.round(n)} ${unit}`;
  const value = n / base ** e;
  return `${value.toFixed(1)} ${unit}`;
}

export function pickColumnUnit(values: readonly number[], base: UnitBase): UnitLabel {
  if (values.length === 0) return 'B';
  const max = Math.max(...values);
  const e = exponentFor(max, base);
  return unitTable(base)[e] ?? 'B';
}

/**
 * Format `n` using a specific unit (bypasses per-value unit picking). Used by
 * render layers to keep a column in one unit so values are visually aligned.
 */
export function formatInUnit(n: number, unit: UnitLabel, base: UnitBase): string {
  const table = unitTable(base);
  const e = table.indexOf(unit);
  if (e < 0) return formatBytes(n, base);
  if (e === 0) return `${Math.round(n)}`;
  return (n / base ** e).toFixed(1);
}
