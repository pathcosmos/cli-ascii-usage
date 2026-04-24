import { describe, it, expect } from 'vitest';
import { renderFilesystems } from '../../src/render/filesystems.js';
import type { DiskReport, RenderOptions, SortField } from '../../src/model.js';

const FIXED_REPORT: DiskReport = {
  schemaVersion: 1,
  platform: 'linux',
  collectedAt: new Date('2026-04-24T00:00:00Z'),
  physicalDisks: [],
  filesystems: [
    {
      mountpoint: '/',
      device: '/dev/mapper/ubuntu--vg-root--lv',
      fstype: 'ext4',
      sizeBytes: 107_374_182_400,
      usedBytes: 35_400_000_000,
      freeBytes: 71_974_182_400,
      physicalDiskId: '/dev/sda',
      isPseudo: false,
    },
    {
      mountpoint: '/home',
      device: '/dev/mapper/ubuntu--vg-home--lv',
      fstype: 'ext4',
      sizeBytes: 394_920_886_272,
      usedBytes: 206_000_000_000,
      freeBytes: 188_920_886_272,
      physicalDiskId: '/dev/sda',
      isPseudo: false,
    },
    {
      mountpoint: '/mnt/data',
      device: '/dev/sdb1',
      fstype: 'ext4',
      sizeBytes: 2_000_000_000_000,
      usedBytes: 1_000_000_000_000,
      freeBytes: 1_000_000_000_000,
      physicalDiskId: '/dev/sdb',
      isPseudo: false,
    },
    {
      mountpoint: '/run',
      device: 'tmpfs',
      fstype: 'tmpfs',
      sizeBytes: 1_660_000_000,
      usedBytes: 2_300_000,
      freeBytes: 1_657_700_000,
      isPseudo: true,
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

describe('renderFilesystems — header + default sort', () => {
  it('renders FILESYSTEMS header + non-pseudo rows at width=100, sort=size desc', () => {
    const out = renderFilesystems(FIXED_REPORT, baseOpts());
    expect(out).toContain('FILESYSTEMS');
    expect(out).toContain('/mnt/data');
    expect(out).toContain('/home');
    expect(out).toContain('/'); // root
    expect(out).not.toContain('tmpfs'); // pseudo filtered by default
    expect(out).toMatchSnapshot();
  });
});

describe('renderFilesystems — showAll toggles pseudo rows', () => {
  it('showAll=false omits tmpfs', () => {
    const out = renderFilesystems(FIXED_REPORT, baseOpts({ showAll: false }));
    expect(out).not.toMatch(/tmpfs/);
  });

  it('showAll=true includes tmpfs', () => {
    const out = renderFilesystems(FIXED_REPORT, baseOpts({ showAll: true }));
    expect(out).toContain('tmpfs');
    expect(out).toContain('/run');
  });
});

describe('renderFilesystems — sort', () => {
  const sortFields: SortField[] = ['size', 'used', 'free', 'use%', 'name'];
  for (const sort of sortFields) {
    it(`sort=${sort} produces a stable snapshot`, () => {
      const out = renderFilesystems(FIXED_REPORT, baseOpts({ sort }));
      expect(out).toMatchSnapshot();
    });
  }

  it('sort=name orders ascending', () => {
    const out = renderFilesystems(FIXED_REPORT, baseOpts({ sort: 'name' }));
    const rootIdx = out.indexOf(' /');
    const homeIdx = out.indexOf('/home');
    const dataIdx = out.indexOf('/mnt/data');
    expect(rootIdx).toBeLessThan(homeIdx);
    expect(homeIdx).toBeLessThan(dataIdx);
  });

  it('sort=size orders descending', () => {
    const out = renderFilesystems(FIXED_REPORT, baseOpts({ sort: 'size' }));
    const dataIdx = out.indexOf('/mnt/data');
    const homeIdx = out.indexOf('/home');
    // /mnt/data (2 TB) > /home (394 GB) so /mnt/data comes first
    expect(dataIdx).toBeLessThan(homeIdx);
  });
});

describe('renderFilesystems — useColor invariant', () => {
  it('useColor=false → no ANSI escapes', () => {
    const out = renderFilesystems(FIXED_REPORT, baseOpts());
    expect(out.includes('\x1b[')).toBe(false);
  });
});

describe('renderFilesystems — empty', () => {
  it('empty filesystems returns empty string', () => {
    const empty: DiskReport = { ...FIXED_REPORT, filesystems: [] };
    expect(renderFilesystems(empty, baseOpts())).toBe('');
  });
});
