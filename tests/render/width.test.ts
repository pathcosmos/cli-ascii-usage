import { describe, it, expect } from 'vitest';
import {
  truncateMiddle,
  computeBarWidth,
  getTerminalWidth,
} from '../../src/render/width.js';

describe('truncateMiddle', () => {
  it('returns input when <= maxCols', () => {
    expect(truncateMiddle('/a/b', 10)).toBe('/a/b');
    expect(truncateMiddle('', 10)).toBe('');
  });

  it('elides middle with …', () => {
    const s = truncateMiddle('/Users/alice/projects/dleft', 15);
    expect([...s].length).toBeLessThanOrEqual(15);
    expect(s).toContain('…');
    expect(s.startsWith('/')).toBe(true);
  });

  it('preserves both ends of long path', () => {
    const s = truncateMiddle('/a/b/c/d/e/f/g/h/i/j', 10);
    expect(s.startsWith('/a')).toBe(true);
    expect(s.endsWith('j')).toBe(true);
  });

  it('returns just the ellipsis when maxCols==1', () => {
    expect(truncateMiddle('/a/b/c/d', 1)).toBe('…');
  });

  it('handles CJK wide chars by display width', () => {
    // "가" has display width 2; input display width = 6 (/=1, 가=2, /=1, 가=2)
    // At maxCols=4, must truncate.
    const s = truncateMiddle('/가/나/다/라', 4);
    expect(s).toContain('…');
  });
});

describe('computeBarWidth', () => {
  it('clamps to [10,30]', () => {
    expect(computeBarWidth(40, 30)).toBe(10);
    expect(computeBarWidth(200, 30)).toBe(30);
    expect(computeBarWidth(30, 30)).toBe(10);
    expect(computeBarWidth(0, 30)).toBe(10);
  });

  it('scales linearly in the middle band', () => {
    expect(computeBarWidth(60, 30)).toBe(30);
    expect(computeBarWidth(50, 30)).toBe(20);
  });
});

describe('getTerminalWidth', () => {
  it('falls back to 80 when no columns hint', () => {
    expect(getTerminalWidth(undefined)).toBe(80);
  });

  it('returns provided columns when positive', () => {
    expect(getTerminalWidth(120)).toBe(120);
  });

  it('falls back to 80 for non-positive', () => {
    expect(getTerminalWidth(0)).toBe(80);
    expect(getTerminalWidth(-5)).toBe(80);
  });
});
