import { describe, it, expect } from 'vitest';
import { renderDisks } from '../../src/render/disks.js';
import type { DiskReport, RenderOptions } from '../../src/model.js';

const FIXED_REPORT: DiskReport = {
  schemaVersion: 1,
  platform: 'darwin',
  collectedAt: new Date('2026-04-24T00:00:00Z'),
  physicalDisks: [
    {
      id: 'disk3',
      model: 'APPLE SSD AP1024N',
      sizeBytes: 994_662_584_320,
      usedBytes: 449_588_158_464,
      freeBytes: 545_074_425_856,
    },
    {
      id: 'disk13',
      model: 'External 2TB',
      sizeBytes: 2_000_189_177_856,
      usedBytes: 1_151_926_161_408,
      freeBytes: 848_263_016_448,
    },
  ],
  filesystems: [],
  warnings: [],
};

function baseOpts(overrides: Partial<RenderOptions> = {}): RenderOptions {
  return {
    useColor: false,
    width: 80,
    unicode: true,
    showBars: true,
    showAll: false,
    sort: 'size',
    base: 1024,
    json: false,
    ...overrides,
  };
}

describe('renderDisks', () => {
  it('renders PHYSICAL DISKS header + both disks at width=80, no color', () => {
    const out = renderDisks(FIXED_REPORT, baseOpts());
    expect(out).toContain('PHYSICAL DISKS');
    expect(out).toContain('disk3');
    expect(out).toContain('disk13');
    expect(out).toMatchSnapshot();
  });

  it('omits bar column when showBars=false', () => {
    const withBars = renderDisks(FIXED_REPORT, baseOpts());
    const noBars = renderDisks(FIXED_REPORT, baseOpts({ showBars: false }));
    // Bar column uses unicode blocks; their absence is the invariant.
    expect(noBars).not.toContain('█');
    expect(noBars).not.toContain('▓');
    expect(withBars).toContain('█');
  });

  it('useColor=false output contains no ANSI escapes', () => {
    const out = renderDisks(FIXED_REPORT, baseOpts());
    // ESC (0x1B) followed by [
    expect(out.includes('\x1b[')).toBe(false);
  });

  it('empty physicalDisks returns empty string (caller decides header policy)', () => {
    const empty: DiskReport = { ...FIXED_REPORT, physicalDisks: [] };
    expect(renderDisks(empty, baseOpts())).toBe('');
  });

  it('width=120 produces wider bar column than width=80', () => {
    const narrow = renderDisks(FIXED_REPORT, baseOpts({ width: 80 }));
    const wide = renderDisks(FIXED_REPORT, baseOpts({ width: 120 }));
    const narrowBarLen = (narrow.match(/[█▓]+/g) ?? [])[0]?.length ?? 0;
    const wideBarLen = (wide.match(/[█▓]+/g) ?? [])[0]?.length ?? 0;
    expect(wideBarLen).toBeGreaterThan(narrowBarLen);
  });
});
