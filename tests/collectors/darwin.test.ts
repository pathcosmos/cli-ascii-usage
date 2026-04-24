import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { FakeRunner } from '../helpers/fake-runner.js';
import { collectDarwin } from '../../src/collectors/darwin.js';

const fixtureDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/darwin',
);

const DISKUTIL_LIST_KEY = 'diskutil list -plist';
const DISKUTIL_APFS_KEY = 'diskutil apfs list -plist';
const DF_KEY = 'df -kP';

let listPlist: string;
let apfsPlist: string;
let dfOut: string;

beforeAll(() => {
  listPlist = readFileSync(resolve(fixtureDir, 'diskutil-list.plist'), 'utf8');
  apfsPlist = readFileSync(resolve(fixtureDir, 'diskutil-apfs-list.plist'), 'utf8');
  dfOut = readFileSync(resolve(fixtureDir, 'df-kP.txt'), 'utf8');
});

describe('collectDarwin — happy path', () => {
  it('returns DiskReport with platform=darwin', async () => {
    const runner = new FakeRunner({
      [DISKUTIL_LIST_KEY]: listPlist,
      [DISKUTIL_APFS_KEY]: apfsPlist,
      [DF_KEY]: dfOut,
    });
    const report = await collectDarwin(runner);
    expect(report.platform).toBe('darwin');
    expect(report.schemaVersion).toBe(1);
    expect(report.warnings).toEqual([]);
  });

  it('creates one PhysicalDisk per APFS container', async () => {
    const runner = new FakeRunner({
      [DISKUTIL_LIST_KEY]: listPlist,
      [DISKUTIL_APFS_KEY]: apfsPlist,
      [DF_KEY]: dfOut,
    });
    const { physicalDisks } = await collectDarwin(runner);
    // Fixture has 12 APFS containers.
    expect(physicalDisks).toHaveLength(12);
    // Every id matches the disk<N> pattern (container reference).
    expect(physicalDisks.every((d) => /^disk\d+$/.test(d.id))).toBe(true);
  });

  it('PhysicalDisk.usedBytes = CapacityCeiling - CapacityFree (NOT Σ volume.CapacityInUse)', async () => {
    const runner = new FakeRunner({
      [DISKUTIL_LIST_KEY]: listPlist,
      [DISKUTIL_APFS_KEY]: apfsPlist,
      [DF_KEY]: dfOut,
    });
    const { physicalDisks } = await collectDarwin(runner);
    // Container disk3 in fixture: ceiling=994662584320, free=545074425856
    const disk3 = physicalDisks.find((d) => d.id === 'disk3');
    expect(disk3?.sizeBytes).toBe(994662584320);
    expect(disk3?.freeBytes).toBe(545074425856);
    expect(disk3?.usedBytes).toBe(994662584320 - 545074425856);
    // Naive volume sum for disk3 is 449381466112 — should NOT equal that here.
    // (In this particular fixture they happen to match; the invariant we lock
    // is that the value came from ceiling-minus-free, which survives even
    // when snapshots/reserves make the volume sum wrong.)
  });

  it('maps APFS volumes to their container disk via physicalDiskId', async () => {
    const runner = new FakeRunner({
      [DISKUTIL_LIST_KEY]: listPlist,
      [DISKUTIL_APFS_KEY]: apfsPlist,
      [DF_KEY]: dfOut,
    });
    const { filesystems } = await collectDarwin(runner);
    // Fixture df row: /dev/disk3s1s1 mounted at /
    const root = filesystems.find((f) => f.mountpoint === '/');
    expect(root?.device).toContain('disk3');
    expect(root?.physicalDiskId).toBe('disk3');
  });

  it('flags pseudo-fs (devfs, map auto_home)', async () => {
    const runner = new FakeRunner({
      [DISKUTIL_LIST_KEY]: listPlist,
      [DISKUTIL_APFS_KEY]: apfsPlist,
      [DF_KEY]: dfOut,
    });
    const { filesystems } = await collectDarwin(runner);
    const devfs = filesystems.find((f) => f.device === 'devfs');
    expect(devfs?.isPseudo).toBe(true);
    const maps = filesystems.filter((f) => f.device.startsWith('map '));
    expect(maps.every((f) => f.isPseudo)).toBe(true);
  });

  it('converts df values × 1024 to bytes', async () => {
    const runner = new FakeRunner({
      [DISKUTIL_LIST_KEY]: listPlist,
      [DISKUTIL_APFS_KEY]: apfsPlist,
      [DF_KEY]: dfOut,
    });
    const { filesystems } = await collectDarwin(runner);
    const root = filesystems.find((f) => f.mountpoint === '/');
    // df row: /dev/disk3s1s1 971350180 12261776 532299188 3% /
    expect(root?.sizeBytes).toBe(971350180 * 1024);
    expect(root?.usedBytes).toBe(12261776 * 1024);
  });
});

describe('collectDarwin — APFS timeout resilience', () => {
  it('apfs list timeout → empty physicalDisks + warning, df still renders', async () => {
    const runner = new FakeRunner({
      [DISKUTIL_LIST_KEY]: listPlist,
      [DISKUTIL_APFS_KEY]: { timeout: true },
      [DF_KEY]: dfOut,
    });
    const report = await collectDarwin(runner);
    expect(report.physicalDisks).toEqual([]);
    expect(
      report.warnings.some((w) =>
        /diskutil apfs list.*timed?.?out.*physical disk summary unavailable/i.test(
          w,
        ),
      ),
    ).toBe(true);
    expect(report.filesystems.length).toBeGreaterThan(0);
    // Crucially: filesystems are NOT joined to inferred containers — no guessing.
    expect(report.filesystems.every((f) => f.physicalDiskId === undefined)).toBe(
      true,
    );
  });

  it('df timeout → empty filesystems + warning, physical disks still render', async () => {
    const runner = new FakeRunner({
      [DISKUTIL_LIST_KEY]: listPlist,
      [DISKUTIL_APFS_KEY]: apfsPlist,
      [DF_KEY]: { timeout: true },
    });
    const report = await collectDarwin(runner);
    expect(report.filesystems).toEqual([]);
    expect(report.warnings.some((w) => /df.*timeout/i.test(w))).toBe(true);
    expect(report.physicalDisks.length).toBeGreaterThan(0);
  });
});
