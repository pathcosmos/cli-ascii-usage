import type { DiskReport, RenderOptions } from '../model.js';
import { renderDisks } from './disks.js';
import { renderFilesystems } from './filesystems.js';

function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function renderWarnings(warnings: readonly string[]): string {
  if (warnings.length === 0) return '';
  return ['WARNINGS:', ...warnings.map((w) => `  ! ${w}`)].join('\n');
}

/**
 * Pure: no stdout, no env, no TTY checks. Caller decides width, color,
 * unicode via `opts`. JSON mode bypasses the text renderer entirely.
 */
export function render(report: DiskReport, opts: RenderOptions): string {
  if (opts.json) {
    return JSON.stringify(report, jsonReplacer, 2);
  }

  const sections: string[] = [];
  if (opts.only !== 'fs') {
    const disks = renderDisks(report, opts);
    if (disks) sections.push(disks);
  }
  if (opts.only !== 'disks') {
    const fs = renderFilesystems(report, opts);
    if (fs) sections.push(fs);
  }

  const warnings = renderWarnings(report.warnings);
  if (warnings) sections.push(warnings);

  return sections.join('\n\n');
}
