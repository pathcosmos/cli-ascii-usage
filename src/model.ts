/**
 * Core domain types for dleft.
 *
 * This module is types-only: no runtime imports, no side effects. Keep it that
 * way so that both collectors (which spawn subprocesses) and the render layer
 * (pure) can import these without pulling in node:child_process transitively.
 */

export interface DiskReport {
  /**
   * Bump on breaking change to DiskReport shape only. Downstream `jq`
   * consumers can gate on this field. Current: 1.
   */
  schemaVersion: 1;
  platform: 'darwin' | 'linux';
  collectedAt: Date;
  physicalDisks: PhysicalDisk[];
  filesystems: Filesystem[];
  /** Non-fatal issues surfaced to the user (timeouts, unmapped devices). */
  warnings: string[];
}

export interface PhysicalDisk {
  /** Platform-native id: e.g. 'disk0' (darwin), '/dev/sda' (linux). */
  id: string;
  model?: string;
  sizeBytes: number;
  /**
   * Container-level used bytes, NOT Σ volume.usedBytes.
   *
   * APFS volumes in the same container share free space; naively summing
   * per-volume used bytes double-counts shared blocks. macOS collectors must
   * source this from `diskutil apfs list` container totals.
   */
  usedBytes: number;
  freeBytes: number;
}

export interface Filesystem {
  mountpoint: string;
  device: string;
  fstype: string;
  sizeBytes: number;
  usedBytes: number;
  freeBytes: number;
  /** Parent physical disk; undefined when unmappable (warned separately). */
  physicalDiskId?: string;
  /** tmpfs, devfs, overlay, squashfs, autofs, fuse.gvfsd-*, etc. */
  isPseudo: boolean;
}

export interface CommandRunner {
  run(
    cmd: string,
    args: readonly string[],
    opts?: { timeoutMs?: number },
  ): Promise<string>;
}

export type SortField = 'size' | 'used' | 'free' | 'use%' | 'name';
export type UnitBase = 1024 | 1000;
export type OnlySection = 'disks' | 'fs';

export interface RenderOptions {
  useColor: boolean;
  width: number;
  unicode: boolean;
  showBars: boolean;
  showAll: boolean;
  only?: OnlySection;
  sort: SortField;
  base: UnitBase;
  json: boolean;
}
