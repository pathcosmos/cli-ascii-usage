import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { FakeRunner } from '../helpers/fake-runner.js';
import { collect } from '../../src/collectors/index.js';

const darwinDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/darwin',
);
const linuxDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/linux',
);

describe('collect — platform dispatch', () => {
  it('platform=darwin routes to collectDarwin', async () => {
    const runner = new FakeRunner({
      'diskutil list -plist': readFileSync(
        resolve(darwinDir, 'diskutil-list.plist'),
        'utf8',
      ),
      'diskutil apfs list -plist': readFileSync(
        resolve(darwinDir, 'diskutil-apfs-list.plist'),
        'utf8',
      ),
      'df -kP': readFileSync(resolve(darwinDir, 'df-kP.txt'), 'utf8'),
    });
    const report = await collect(runner, 'darwin');
    expect(report.platform).toBe('darwin');
  });

  it('platform=linux routes to collectLinux', async () => {
    const runner = new FakeRunner({
      'lsblk -J -b -o NAME,KNAME,SIZE,TYPE,MODEL,MOUNTPOINT,FSTYPE': readFileSync(
        resolve(linuxDir, 'lsblk.json'),
        'utf8',
      ),
      'df -kPT': readFileSync(resolve(linuxDir, 'df-kPT.txt'), 'utf8'),
    });
    const report = await collect(runner, 'linux');
    expect(report.platform).toBe('linux');
  });

  it('unsupported platform rejects with a friendly message', async () => {
    const runner = new FakeRunner({});
    await expect(collect(runner, 'win32')).rejects.toThrow(
      /dleft: platform win32 is not supported \(darwin and linux only\)/,
    );
  });
});
