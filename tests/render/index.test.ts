import { describe, it, expect } from 'vitest';
import { render } from '../../src/render/index.js';
import type { DiskReport, RenderOptions } from '../../src/model.js';

const REPORT: DiskReport = {
  schemaVersion: 1,
  platform: 'linux',
  collectedAt: new Date('2026-04-24T00:00:00Z'),
  physicalDisks: [
    {
      id: '/dev/sda',
      model: 'Samsung SSD 860 EVO',
      sizeBytes: 512_110_190_592,
      usedBytes: 240_000_000_000,
      freeBytes: 272_110_190_592,
    },
  ],
  filesystems: [
    {
      mountpoint: '/',
      device: '/dev/sda1',
      fstype: 'ext4',
      sizeBytes: 107_374_182_400,
      usedBytes: 35_400_000_000,
      freeBytes: 71_974_182_400,
      physicalDiskId: '/dev/sda',
      isPseudo: false,
    },
  ],
  warnings: [],
};

function baseOpts(overrides: Partial<RenderOptions> = {}): RenderOptions {
  return {
    useColor: false,
    width: 100,
    unicode: true,
    showBars: true,
    showAll: false,
    sort: 'size',
    base: 1024,
    json: false,
    ...overrides,
  };
}

describe('render — JSON mode', () => {
  it('opts.json=true returns valid JSON w/ schemaVersion:1', () => {
    const out = render(REPORT, baseOpts({ json: true }));
    const parsed = JSON.parse(out);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.platform).toBe('linux');
    expect(parsed.physicalDisks).toHaveLength(1);
    expect(parsed.filesystems).toHaveLength(1);
  });

  it('serializes Date collectedAt as ISO string', () => {
    const out = render(REPORT, baseOpts({ json: true }));
    const parsed = JSON.parse(out);
    expect(parsed.collectedAt).toBe('2026-04-24T00:00:00.000Z');
  });
});

describe('render — --only filter', () => {
  it('only="disks" includes PHYSICAL DISKS, excludes FILESYSTEMS', () => {
    const out = render(REPORT, baseOpts({ only: 'disks' }));
    expect(out).toContain('PHYSICAL DISKS');
    expect(out).not.toContain('FILESYSTEMS');
  });

  it('only="fs" includes FILESYSTEMS, excludes PHYSICAL DISKS', () => {
    const out = render(REPORT, baseOpts({ only: 'fs' }));
    expect(out).toContain('FILESYSTEMS');
    expect(out).not.toContain('PHYSICAL DISKS');
  });

  it('no --only shows both sections', () => {
    const out = render(REPORT, baseOpts());
    expect(out).toContain('PHYSICAL DISKS');
    expect(out).toContain('FILESYSTEMS');
  });
});

describe('render — warnings footer', () => {
  it('no warnings → no WARNINGS block', () => {
    const out = render(REPORT, baseOpts());
    expect(out).not.toContain('WARNINGS:');
  });

  it('warnings present → appended under WARNINGS: header', () => {
    const withWarnings: DiskReport = {
      ...REPORT,
      warnings: ['diskutil apfs list: timed out', 'df: truncated row'],
    };
    const out = render(withWarnings, baseOpts());
    expect(out).toContain('WARNINGS:');
    expect(out).toContain('diskutil apfs list: timed out');
    expect(out).toContain('df: truncated row');
  });
});

describe('render — width responsiveness', () => {
  it.each([40, 80, 120, 200])('snapshot at width=%i', (width) => {
    expect(render(REPORT, baseOpts({ width }))).toMatchSnapshot();
  });
});

describe('render — color invariant', () => {
  it('useColor=false produces no ANSI escapes anywhere', () => {
    const out = render(REPORT, baseOpts());
    expect(out.includes('\x1b[')).toBe(false);
  });
});
