import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { FakeRunner } from '../helpers/fake-runner.js';
import { collectLinux } from '../../src/collectors/linux.js';

const fixtureDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/linux',
);

const LSBLK_KEY = 'lsblk -J -b -o NAME,KNAME,SIZE,TYPE,MODEL,MOUNTPOINT,FSTYPE';
const DF_KEY = 'df -kPT';

let lsblkOut: string;
let dfOut: string;

beforeAll(() => {
  lsblkOut = readFileSync(resolve(fixtureDir, 'lsblk.json'), 'utf8');
  dfOut = readFileSync(resolve(fixtureDir, 'df-kPT.txt'), 'utf8');
});

describe('collectLinux — happy path', () => {
  it('returns DiskReport with platform=linux', async () => {
    const runner = new FakeRunner({ [LSBLK_KEY]: lsblkOut, [DF_KEY]: dfOut });
    const report = await collectLinux(runner);
    expect(report.platform).toBe('linux');
    expect(report.schemaVersion).toBe(1);
    expect(report.warnings).toEqual([]);
  });

  it('extracts both physical disks from fixture', async () => {
    const runner = new FakeRunner({ [LSBLK_KEY]: lsblkOut, [DF_KEY]: dfOut });
    const { physicalDisks } = await collectLinux(runner);
    expect(physicalDisks).toHaveLength(2);
    const sda = physicalDisks.find((d) => d.id === '/dev/sda');
    const sdb = physicalDisks.find((d) => d.id === '/dev/sdb');
    expect(sda?.sizeBytes).toBe(512110190592);
    expect(sda?.model).toContain('Samsung');
    expect(sdb?.sizeBytes).toBe(2000398934016);
    expect(sdb?.model).toContain('WDC');
  });

  it('filesystem rows map to correct physical disk', async () => {
    const runner = new FakeRunner({ [LSBLK_KEY]: lsblkOut, [DF_KEY]: dfOut });
    const { filesystems } = await collectLinux(runner);
    const root = filesystems.find((f) => f.mountpoint === '/');
    const boot = filesystems.find((f) => f.mountpoint === '/boot');
    const home = filesystems.find((f) => f.mountpoint === '/home');
    const data = filesystems.find((f) => f.mountpoint === '/mnt/data');
    expect(root?.physicalDiskId).toBe('/dev/sda');
    expect(boot?.physicalDiskId).toBe('/dev/sda');
    expect(home?.physicalDiskId).toBe('/dev/sda');
    expect(data?.physicalDiskId).toBe('/dev/sdb');
  });

  it('flags pseudo-fs entries (tmpfs, overlay)', async () => {
    const runner = new FakeRunner({ [LSBLK_KEY]: lsblkOut, [DF_KEY]: dfOut });
    const { filesystems } = await collectLinux(runner);
    const tmpfs = filesystems.filter((f) => f.fstype === 'tmpfs');
    expect(tmpfs.length).toBeGreaterThan(0);
    expect(tmpfs.every((f) => f.isPseudo)).toBe(true);
    const overlay = filesystems.find((f) => f.fstype === 'overlay');
    expect(overlay?.isPseudo).toBe(true);
    const ext4 = filesystems.find((f) => f.fstype === 'ext4');
    expect(ext4?.isPseudo).toBe(false);
  });

  it('sums child filesystem usedBytes into PhysicalDisk.usedBytes', async () => {
    const runner = new FakeRunner({ [LSBLK_KEY]: lsblkOut, [DF_KEY]: dfOut });
    const { filesystems, physicalDisks } = await collectLinux(runner);
    const sda = physicalDisks.find((d) => d.id === '/dev/sda');
    const sdaFs = filesystems.filter(
      (f) => f.physicalDiskId === '/dev/sda' && !f.isPseudo,
    );
    const sumUsed = sdaFs.reduce((acc, f) => acc + f.usedBytes, 0);
    expect(sda?.usedBytes).toBe(sumUsed);
  });

  it('converts df values × 1024 to bytes', async () => {
    const runner = new FakeRunner({ [LSBLK_KEY]: lsblkOut, [DF_KEY]: dfOut });
    const { filesystems } = await collectLinux(runner);
    const boot = filesystems.find((f) => f.mountpoint === '/boot');
    // df row: /dev/sda2 ext4 1013292 146528 797860 16% /boot
    expect(boot?.sizeBytes).toBe(1013292 * 1024);
    expect(boot?.usedBytes).toBe(146528 * 1024);
    expect(boot?.freeBytes).toBe(797860 * 1024);
  });
});

describe('collectLinux — timeout resilience', () => {
  it('df timeout → empty filesystems + warning, does not throw', async () => {
    const runner = new FakeRunner({
      [LSBLK_KEY]: lsblkOut,
      [DF_KEY]: { timeout: true },
    });
    const report = await collectLinux(runner);
    expect(report.filesystems).toEqual([]);
    expect(report.warnings.some((w) => /df.*timeout/i.test(w))).toBe(true);
    expect(report.physicalDisks.length).toBeGreaterThan(0);
  });

  it('lsblk timeout → empty physicalDisks + warning, filesystems unmapped', async () => {
    const runner = new FakeRunner({
      [LSBLK_KEY]: { timeout: true },
      [DF_KEY]: dfOut,
    });
    const report = await collectLinux(runner);
    expect(report.physicalDisks).toEqual([]);
    expect(report.warnings.some((w) => /lsblk.*timeout/i.test(w))).toBe(true);
    expect(report.filesystems.every((f) => f.physicalDiskId === undefined)).toBe(
      true,
    );
  });
});
