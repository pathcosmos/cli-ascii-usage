import { describe, it, expect } from 'vitest';
import { resolveRenderOpts } from '../src/cli.js';

describe('resolveRenderOpts — color resolution', () => {
  it('--json suppresses color even on TTY', () => {
    const opts = resolveRenderOpts(['--json'], {}, true);
    expect(opts.useColor).toBe(false);
    expect(opts.json).toBe(true);
  });

  it('NO_COLOR env suppresses color', () => {
    const opts = resolveRenderOpts([], { NO_COLOR: '1' }, true);
    expect(opts.useColor).toBe(false);
  });

  it('non-TTY suppresses color even without --no-color', () => {
    const opts = resolveRenderOpts([], {}, false);
    expect(opts.useColor).toBe(false);
  });

  it('--no-color suppresses color', () => {
    const opts = resolveRenderOpts(['--no-color'], {}, true);
    expect(opts.useColor).toBe(false);
  });

  it('TTY + no overrides → color on', () => {
    const opts = resolveRenderOpts([], {}, true);
    expect(opts.useColor).toBe(true);
  });
});

describe('resolveRenderOpts — flags', () => {
  it('--si switches base to 1000', () => {
    expect(resolveRenderOpts(['--si'], {}, true).base).toBe(1000);
  });

  it('default base is 1024', () => {
    expect(resolveRenderOpts([], {}, true).base).toBe(1024);
  });

  it('-s name sets sort field', () => {
    expect(resolveRenderOpts(['-s', 'name'], {}, true).sort).toBe('name');
  });

  it('--sort use% accepts use% literal', () => {
    expect(resolveRenderOpts(['--sort', 'use%'], {}, true).sort).toBe('use%');
  });

  it('-a enables showAll', () => {
    expect(resolveRenderOpts(['-a'], {}, true).showAll).toBe(true);
  });

  it('--no-bars disables bar column', () => {
    expect(resolveRenderOpts(['--no-bars'], {}, true).showBars).toBe(false);
  });

  it('--only disks sets only=disks', () => {
    expect(resolveRenderOpts(['--only', 'disks'], {}, true).only).toBe('disks');
  });
});

describe('resolveRenderOpts — validation', () => {
  it('invalid sort throws with INVALID_ARG code', () => {
    try {
      resolveRenderOpts(['--sort', 'bogus'], {}, true);
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as Error).message).toMatch(/invalid sort/i);
      expect((err as NodeJS.ErrnoException).code).toBe('INVALID_ARG');
    }
  });

  it('invalid only throws with INVALID_ARG code', () => {
    try {
      resolveRenderOpts(['--only', 'cpu'], {}, true);
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as NodeJS.ErrnoException).code).toBe('INVALID_ARG');
    }
  });

  it('unknown flag throws with INVALID_ARG code', () => {
    try {
      resolveRenderOpts(['--nonsense'], {}, true);
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as NodeJS.ErrnoException).code).toBe('INVALID_ARG');
    }
  });
});

describe('resolveRenderOpts — width + unicode', () => {
  it('defaults width to 80 when columns undefined', () => {
    const opts = resolveRenderOpts([], {}, true, { columns: undefined });
    expect(opts.width).toBe(80);
  });

  it('uses provided columns when present', () => {
    const opts = resolveRenderOpts([], {}, true, { columns: 140 });
    expect(opts.width).toBe(140);
  });

  it('DLEFT_ASCII=1 forces unicode=false', () => {
    expect(resolveRenderOpts([], { DLEFT_ASCII: '1' }, true).unicode).toBe(false);
  });

  it('unicode on by default', () => {
    expect(resolveRenderOpts([], {}, true).unicode).toBe(true);
  });
});
