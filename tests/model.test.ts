import { describe, it, expectTypeOf } from 'vitest';
import type {
  DiskReport,
  PhysicalDisk,
  Filesystem,
  CommandRunner,
  RenderOptions,
} from '../src/model.js';

describe('model', () => {
  it('DiskReport has schemaVersion literal 1', () => {
    const r: DiskReport = {
      schemaVersion: 1,
      platform: 'darwin',
      collectedAt: new Date(),
      physicalDisks: [],
      filesystems: [],
      warnings: [],
    };
    expectTypeOf(r.schemaVersion).toEqualTypeOf<1>();
  });

  it('PhysicalDisk fields shape', () => {
    const d: PhysicalDisk = {
      id: 'disk0',
      model: 'APPLE SSD',
      sizeBytes: 1_000_000_000_000,
      usedBytes: 500_000_000_000,
      freeBytes: 500_000_000_000,
    };
    expectTypeOf(d.sizeBytes).toBeNumber();
  });

  it('Filesystem fields shape with optional physicalDiskId', () => {
    const fs: Filesystem = {
      mountpoint: '/',
      device: '/dev/disk1s1',
      fstype: 'apfs',
      sizeBytes: 1,
      usedBytes: 1,
      freeBytes: 0,
      isPseudo: false,
    };
    expectTypeOf(fs.physicalDiskId).toEqualTypeOf<string | undefined>();
  });

  it('CommandRunner.run returns Promise<string>', () => {
    const fake: CommandRunner = { run: async () => '' };
    expectTypeOf(fake.run).returns.resolves.toBeString();
  });

  it('RenderOptions has correct union types', () => {
    const opts: RenderOptions = {
      useColor: false,
      width: 80,
      unicode: true,
      showBars: true,
      showAll: false,
      sort: 'size',
      base: 1024,
      json: false,
    };
    expectTypeOf(opts.base).toEqualTypeOf<1024 | 1000>();
    expectTypeOf(opts.sort).toEqualTypeOf<'size' | 'used' | 'free' | 'use%' | 'name'>();
  });
});
