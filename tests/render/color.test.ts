import { describe, it, expect } from 'vitest';
import {
  colorize,
  thresholdColor,
  THRESHOLD_DANGER,
  THRESHOLD_WARN,
} from '../../src/render/color.js';

describe('color thresholds', () => {
  it('constants', () => {
    expect(THRESHOLD_DANGER).toBe(0.9);
    expect(THRESHOLD_WARN).toBe(0.75);
  });
});

describe('colorize (useColor=false)', () => {
  it('returns byte-identical string (no ANSI) even at danger ratio', () => {
    const s = colorize(0.95, 'hello', false);
    expect(s).toBe('hello');
    // No escape character
    expect(s.charCodeAt(0)).not.toBe(0x1b);
  });
});

describe('colorize (useColor=true)', () => {
  it('ratio >= 0.9 wraps with red ANSI', () => {
    const s = colorize(0.95, 'hello', true);
    // picocolors uses ESC[31m ... ESC[39m
    expect(s).toMatch(/\[31m.*hello.*\[39m/);
  });

  it('ratio >= 0.75 and < 0.9 wraps with yellow ANSI', () => {
    const s = colorize(0.8, 'hello', true);
    expect(s).toMatch(/\[33m.*hello.*\[39m/);
  });

  it('ratio < 0.75 returns bare string', () => {
    expect(colorize(0.5, 'hello', true)).toBe('hello');
  });
});

describe('thresholdColor', () => {
  it('returns "danger" at >=0.9', () => {
    expect(thresholdColor(0.9)).toBe('danger');
    expect(thresholdColor(0.95)).toBe('danger');
    expect(thresholdColor(1)).toBe('danger');
  });
  it('returns "warn" at 0.75–0.9', () => {
    expect(thresholdColor(0.75)).toBe('warn');
    expect(thresholdColor(0.85)).toBe('warn');
  });
  it('returns "ok" below 0.75', () => {
    expect(thresholdColor(0)).toBe('ok');
    expect(thresholdColor(0.7)).toBe('ok');
  });
});
