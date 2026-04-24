import type {
  CommandRunner,
  DiskReport,
  Filesystem,
  PhysicalDisk,
} from '../model.js';

interface LsblkNode {
  name: string;
  kname?: string;
  size?: number | string;
  type?: string;
  model?: string | null;
  mountpoint?: string | null;
  fstype?: string | null;
  children?: LsblkNode[];
}

interface LsblkOutput {
  blockdevices: LsblkNode[];
}

interface DfRow {
  device: string;
  fstype: string;
  sizeBytes: number;
  usedBytes: number;
  freeBytes: number;
  mountpoint: string;
}

const PSEUDO_FSTYPES = new Set([
  'tmpfs',
  'devfs',
  'devtmpfs',
  'overlay',
  'squashfs',
  'autofs',
  'proc',
  'sysfs',
  'cgroup',
  'cgroup2',
  'mqueue',
  'debugfs',
  'tracefs',
  'fusectl',
  'pstore',
  'bpf',
  'configfs',
  'ramfs',
  'hugetlbfs',
]);

function isPseudoFstype(fstype: string): boolean {
  if (PSEUDO_FSTYPES.has(fstype)) return true;
  if (fstype.startsWith('fuse.gvfsd-')) return true;
  return false;
}

/**
 * Walk lsblk tree, building a name → ancestor-disk map. A node's ancestor disk
 * is the nearest enclosing node with type='disk'. Top-level disks map to
 * themselves.
 */
function buildDiskAncestry(
  tree: LsblkNode[],
): Map<string, LsblkNode> {
  const map = new Map<string, LsblkNode>();
  const walk = (node: LsblkNode, ancestor: LsblkNode | undefined): void => {
    const current = node.type === 'disk' ? node : ancestor;
    if (current) map.set(node.name, current);
    if (node.kname && node.kname !== node.name && current) {
      map.set(node.kname, current);
    }
    for (const child of node.children ?? []) walk(child, current);
  };
  for (const root of tree) walk(root, undefined);
  return map;
}

function parseDfKPT(raw: string): DfRow[] {
  const lines = raw.split('\n').filter((l) => l.trim() && !/^Filesystem/i.test(l));
  const rows: DfRow[] = [];
  for (const line of lines) {
    // Columns: Filesystem Type 1024-blocks Used Available Capacity Mounted-on
    // Mountpoint is the last column; filesystem may contain spaces in rare
    // cases (fuse), but for v0.1 we assume whitespace-split works. Split into
    // 7 parts; mount point may contain spaces → recombine the tail.
    const parts = line.trim().split(/\s+/);
    if (parts.length < 7) continue;
    const [device, fstype, blocks, used, avail, , ...rest] = parts;
    const mountpoint = rest.join(' ');
    const sizeBytes = Number(blocks) * 1024;
    const usedBytes = Number(used) * 1024;
    const freeBytes = Number(avail) * 1024;
    if (
      !device ||
      !fstype ||
      !mountpoint ||
      !Number.isFinite(sizeBytes) ||
      !Number.isFinite(usedBytes)
    ) {
      continue;
    }
    rows.push({ device, fstype, sizeBytes, usedBytes, freeBytes, mountpoint });
  }
  return rows;
}

function deviceKey(devicePath: string): string {
  // Strip /dev/mapper/, /dev/, or leave as-is for tmpfs/overlay/etc.
  if (devicePath.startsWith('/dev/mapper/')) return devicePath.slice(12);
  if (devicePath.startsWith('/dev/')) return devicePath.slice(5);
  return devicePath;
}

export async function collectLinux(runner: CommandRunner): Promise<DiskReport> {
  const warnings: string[] = [];

  const [lsblkRes, dfRes] = await Promise.allSettled([
    runner.run('lsblk', ['-J', '-b', '-o', 'NAME,KNAME,SIZE,TYPE,MODEL,MOUNTPOINT,FSTYPE']),
    runner.run('df', ['-kPT']),
  ]);

  let tree: LsblkNode[] = [];
  if (lsblkRes.status === 'fulfilled') {
    try {
      const parsed = JSON.parse(lsblkRes.value) as LsblkOutput;
      tree = parsed.blockdevices ?? [];
    } catch (err) {
      warnings.push(`lsblk: failed to parse JSON (${(err as Error).message})`);
    }
  } else {
    const err = lsblkRes.reason as NodeJS.ErrnoException;
    warnings.push(
      err.code === 'ETIMEDOUT'
        ? 'lsblk: timeout; physical disk summary unavailable'
        : `lsblk: ${err.message}`,
    );
  }

  let dfRows: DfRow[] = [];
  if (dfRes.status === 'fulfilled') {
    dfRows = parseDfKPT(dfRes.value);
  } else {
    const err = dfRes.reason as NodeJS.ErrnoException;
    warnings.push(
      err.code === 'ETIMEDOUT'
        ? 'df: timeout; filesystem table unavailable'
        : `df: ${err.message}`,
    );
  }

  const ancestry = buildDiskAncestry(tree);

  const physicalDisks: PhysicalDisk[] = tree
    .filter((n) => n.type === 'disk')
    .map((n) => ({
      id: `/dev/${n.name}`,
      ...(n.model ? { model: n.model } : {}),
      sizeBytes: Number(n.size ?? 0),
      usedBytes: 0, // filled in after filesystems computed
      freeBytes: 0,
    }));

  const filesystems: Filesystem[] = dfRows.map((row) => {
    const key = deviceKey(row.device);
    const disk = ancestry.get(key);
    const isPseudo = isPseudoFstype(row.fstype);
    return {
      mountpoint: row.mountpoint,
      device: row.device,
      fstype: row.fstype,
      sizeBytes: row.sizeBytes,
      usedBytes: row.usedBytes,
      freeBytes: row.freeBytes,
      ...(disk && !isPseudo ? { physicalDiskId: `/dev/${disk.name}` } : {}),
      isPseudo,
    };
  });

  // Sum non-pseudo usedBytes per physical disk.
  for (const disk of physicalDisks) {
    const children = filesystems.filter(
      (f) => f.physicalDiskId === disk.id && !f.isPseudo,
    );
    disk.usedBytes = children.reduce((acc, f) => acc + f.usedBytes, 0);
    disk.freeBytes = Math.max(0, disk.sizeBytes - disk.usedBytes);
  }

  return {
    schemaVersion: 1,
    platform: 'linux',
    collectedAt: new Date(),
    physicalDisks,
    filesystems,
    warnings,
  };
}
