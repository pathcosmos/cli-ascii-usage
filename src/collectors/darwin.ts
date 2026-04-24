import plist from 'plist';
import type {
  CommandRunner,
  DiskReport,
  Filesystem,
  PhysicalDisk,
} from '../model.js';

interface ApfsVolume {
  DeviceIdentifier: string;
  Name?: string;
}

interface ApfsContainer {
  ContainerReference?: string;
  DesignatedPhysicalStore?: string;
  CapacityCeiling?: number;
  CapacityFree?: number;
  Volumes?: ApfsVolume[];
}

interface ApfsListOutput {
  Containers?: ApfsContainer[];
}

interface DfRow {
  device: string;
  sizeBytes: number;
  usedBytes: number;
  freeBytes: number;
  mountpoint: string;
}

const DARWIN_PSEUDO_DEVICES = /^(devfs|map\s|mtmfs|autofs|fdesc)/;
const DARWIN_PSEUDO_FSTYPES = new Set(['devfs', 'autofs', 'mtmfs', 'fdesc', 'tmpfs']);

function isPseudoDarwin(device: string, fstype: string): boolean {
  if (DARWIN_PSEUDO_FSTYPES.has(fstype)) return true;
  if (DARWIN_PSEUDO_DEVICES.test(device)) return true;
  return false;
}

function parseDfKP(raw: string): DfRow[] {
  const lines = raw.split('\n').filter((l) => l.trim() && !/^Filesystem/i.test(l));
  const rows: DfRow[] = [];
  for (const line of lines) {
    // Columns: Filesystem 1024-blocks Used Available Capacity MountedOn
    // Mountpoint may contain spaces — recombine tail.
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    const [device, blocks, used, avail, , ...rest] = parts;
    const mountpoint = rest.join(' ');
    const sizeBytes = Number(blocks) * 1024;
    const usedBytes = Number(used) * 1024;
    const freeBytes = Number(avail) * 1024;
    if (
      !device ||
      !mountpoint ||
      !Number.isFinite(sizeBytes) ||
      !Number.isFinite(usedBytes)
    ) {
      continue;
    }
    rows.push({ device, sizeBytes, usedBytes, freeBytes, mountpoint });
  }
  return rows;
}

/**
 * macOS devices look like: /dev/disk3s1s1 (a snapshot of disk3s1 in container
 * disk3). Walk back through layers: disk3s1s1 → disk3s1 → disk3. We match each
 * stripping level against the volume→container map, then fall back to the
 * top-level container id.
 */
function resolveContainerId(
  deviceIdent: string,
  volumeToContainer: Map<string, string>,
): string | undefined {
  let current = deviceIdent;
  while (current.length > 0) {
    const hit = volumeToContainer.get(current);
    if (hit) return hit;
    const match = current.match(/^(disk\d+(?:s\d+)*)s\d+$/);
    if (!match) break;
    current = match[1]!;
  }
  const containerMatch = deviceIdent.match(/^(disk\d+)/);
  if (containerMatch) {
    const containerId = containerMatch[1]!;
    if (Array.from(volumeToContainer.values()).includes(containerId)) {
      return containerId;
    }
  }
  return undefined;
}

function deviceToIdentifier(device: string): string | undefined {
  const match = device.match(/^\/dev\/(disk\d+(?:s\d+)*)/);
  return match?.[1];
}

export async function collectDarwin(runner: CommandRunner): Promise<DiskReport> {
  const warnings: string[] = [];

  const [, apfsRes, dfRes] = await Promise.allSettled([
    runner.run('diskutil', ['list', '-plist']),
    runner.run('diskutil', ['apfs', 'list', '-plist']),
    runner.run('df', ['-kP']),
  ]);

  const physicalDisks: PhysicalDisk[] = [];
  const volumeToContainer = new Map<string, string>();

  if (apfsRes.status === 'fulfilled') {
    try {
      const parsed = plist.parse(apfsRes.value) as unknown as ApfsListOutput;
      for (const container of parsed.Containers ?? []) {
        const id = container.ContainerReference;
        const ceiling = container.CapacityCeiling;
        const free = container.CapacityFree;
        if (!id || ceiling === undefined || free === undefined) continue;
        physicalDisks.push({
          id,
          sizeBytes: ceiling,
          usedBytes: ceiling - free,
          freeBytes: free,
        });
        for (const vol of container.Volumes ?? []) {
          if (vol.DeviceIdentifier) {
            volumeToContainer.set(vol.DeviceIdentifier, id);
          }
        }
      }
    } catch (err) {
      warnings.push(
        `diskutil apfs list: failed to parse plist (${(err as Error).message})`,
      );
    }
  } else {
    const err = apfsRes.reason as NodeJS.ErrnoException;
    warnings.push(
      err.code === 'ETIMEDOUT'
        ? 'diskutil apfs list: timed out; physical disk summary unavailable'
        : `diskutil apfs list: ${err.message}`,
    );
  }

  let dfRows: DfRow[] = [];
  if (dfRes.status === 'fulfilled') {
    dfRows = parseDfKP(dfRes.value);
  } else {
    const err = dfRes.reason as NodeJS.ErrnoException;
    warnings.push(
      err.code === 'ETIMEDOUT'
        ? 'df: timeout; filesystem table unavailable'
        : `df: ${err.message}`,
    );
  }

  const filesystems: Filesystem[] = dfRows.map((row) => {
    const ident = deviceToIdentifier(row.device);
    const containerId = ident
      ? resolveContainerId(ident, volumeToContainer)
      : undefined;
    // df -kP on macOS omits the fstype column; derive a v0.1 label from the
    // device pattern. Render treats this as display-only.
    let fstype = 'apfs';
    if (row.device === 'devfs') fstype = 'devfs';
    else if (row.device.startsWith('map ')) fstype = 'autofs';
    else if (!ident) fstype = 'other';
    return {
      mountpoint: row.mountpoint,
      device: row.device,
      fstype,
      sizeBytes: row.sizeBytes,
      usedBytes: row.usedBytes,
      freeBytes: row.freeBytes,
      ...(containerId ? { physicalDiskId: containerId } : {}),
      isPseudo: isPseudoDarwin(row.device, fstype),
    };
  });

  return {
    schemaVersion: 1,
    platform: 'darwin',
    collectedAt: new Date(),
    physicalDisks,
    filesystems,
    warnings,
  };
}
