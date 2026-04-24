import { describe, it, expect } from 'vitest';
import { formatBytes, pickColumnUnit } from '../../src/render/unit.js';

describe('formatBytes (IEC, base=1024)', () => {
  it.each([
    [0, 1024, '0 B'],
    [1023, 1024, '1023 B'],
    [1024, 1024, '1.0 KiB'],
    [1024 ** 3, 1024, '1.0 GiB'],
    [1024 ** 4, 1024, '1.0 TiB'],
    [Math.floor(999.5 * 1024 ** 3), 1024, '999.5 GiB'],
  ] as const)('formatBytes(%i, %i) === %s', (n, base, expected) => {
    expect(formatBytes(n, base as 1024 | 1000)).toBe(expected);
  });
});

describe('formatBytes (SI, base=1000)', () => {
  it('1000 === 1.0 KB', () => {
    expect(formatBytes(1000, 1000)).toBe('1.0 KB');
  });
  it('1_000_000_000 === 1.0 GB', () => {
    expect(formatBytes(1_000_000_000, 1000)).toBe('1.0 GB');
  });
});

describe('pickColumnUnit (IEC)', () => {
  it('picks GiB when max < 1 TiB', () => {
    expect(pickColumnUnit([1024 ** 3, 5 * 1024 ** 3], 1024)).toBe('GiB');
  });
  it('picks TiB when any value >= 1 TiB', () => {
    expect(pickColumnUnit([1024 ** 3, 2 * 1024 ** 4], 1024)).toBe('TiB');
  });
  it('picks B when all values < 1 KiB', () => {
    expect(pickColumnUnit([0, 1, 1023], 1024)).toBe('B');
  });
  it('returns B for empty array (defensive)', () => {
    expect(pickColumnUnit([], 1024)).toBe('B');
  });
});

describe('pickColumnUnit (SI)', () => {
  it('picks GB when max < 1 TB', () => {
    expect(pickColumnUnit([1_000_000_000, 500_000_000_000], 1000)).toBe('GB');
  });
});
