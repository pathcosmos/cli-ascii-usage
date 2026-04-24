import { describe, it, expect } from 'vitest';
import { FakeRunner } from './fake-runner.js';

describe('FakeRunner', () => {
  it('returns fixture for matching cmd+args', async () => {
    const r = new FakeRunner({ 'echo hi there': 'hi there\n' });
    expect(await r.run('echo', ['hi', 'there'])).toBe('hi there\n');
  });

  it('matches on joined args (preserves order)', async () => {
    const r = new FakeRunner({
      'df -kPT': 'df output\n',
      'lsblk -J -b': 'lsblk output\n',
    });
    expect(await r.run('df', ['-kPT'])).toBe('df output\n');
    expect(await r.run('lsblk', ['-J', '-b'])).toBe('lsblk output\n');
  });

  it('throws descriptive error when key missing', async () => {
    const r = new FakeRunner({});
    await expect(r.run('df', ['-kP'])).rejects.toThrow(
      /FakeRunner: no fixture for 'df -kP'/,
    );
  });

  it('simulates timeout when fixture is {timeout: true}', async () => {
    const r = new FakeRunner({ 'diskutil apfs list -plist': { timeout: true } });
    await expect(r.run('diskutil', ['apfs', 'list', '-plist'])).rejects.toThrow(
      /timeout/i,
    );
  });

  it('timeout rejection carries code=ETIMEDOUT for error-code branches', async () => {
    const r = new FakeRunner({ 'sleep 10': { timeout: true } });
    try {
      await r.run('sleep', ['10']);
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as NodeJS.ErrnoException).code).toBe('ETIMEDOUT');
    }
  });

  it('args with empty array produces key with trailing space after cmd', async () => {
    const r = new FakeRunner({ 'uptime ': 'up 1 day\n' });
    expect(await r.run('uptime', [])).toBe('up 1 day\n');
  });
});
