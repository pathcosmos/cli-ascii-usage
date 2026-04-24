import { describe, it, expect } from 'vitest';
import { renderBar } from '../../src/render/bar.js';

describe('renderBar', () => {
  it('width=20, ratio=0.5, unicode → 10 full blocks + 10 empty', () => {
    const s = renderBar(0.5, 20, { unicode: true });
    expect([...s].filter((c) => c === '█').length).toBe(10);
    expect(s).toHaveLength(20);
  });

  it('ratio=0 → all empty (unicode)', () => {
    expect(renderBar(0, 10, { unicode: true })).toBe('▓'.repeat(10));
  });

  it('ratio=1 → all full (unicode)', () => {
    expect(renderBar(1, 10, { unicode: true })).toBe('█'.repeat(10));
  });

  it('ascii fallback uses # and -', () => {
    expect(renderBar(0.5, 10, { unicode: false })).toBe('#####-----');
  });

  it('clamps ratio to [0,1]', () => {
    expect(renderBar(1.5, 4, { unicode: false })).toBe('####');
    expect(renderBar(-0.5, 4, { unicode: false })).toBe('----');
  });

  it('width=0 returns empty string', () => {
    expect(renderBar(0.5, 0, { unicode: true })).toBe('');
  });

  it('handles NaN ratio as 0', () => {
    expect(renderBar(Number.NaN, 4, { unicode: false })).toBe('----');
  });
});
