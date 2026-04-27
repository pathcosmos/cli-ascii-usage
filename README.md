# dleft

[![CI](https://github.com/pathcosmos/cli-ascii-usage/actions/workflows/ci.yml/badge.svg)](https://github.com/pathcosmos/cli-ascii-usage/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@pathcosmos/dleft.svg)](https://www.npmjs.com/package/@pathcosmos/dleft)
![Node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey)

ASCII disk usage for macOS and Linux — physical disks, partitions, and mounted filesystems, rendered as dense tables with usage bars. **Read-only**: never mutates disk state.

```
$ dleft
PHYSICAL DISKS
ID      MODEL              SIZE (TiB)  USED (TiB)  FREE (GiB)  USE%  BAR
disk3   APPLE SSD AP1024N         0.9         0.4       507.6   45%  █████▓▓▓▓▓▓
disk13  External 2TB              1.8         1.0       790.0   58%  ██████▓▓▓▓▓

FILESYSTEMS
MOUNT             DEVICE          FSTYPE  SIZE (GiB)  USED (GiB)  FREE (GiB)  USE%  BAR
/mnt/data         /dev/sdb1       ext4        1863.0       931.3       931.3   50%  █████▓▓▓▓▓
/home             /dev/mapper/…   ext4         367.8       191.9       175.9   52%  █████▓▓▓▓▓
/                 /dev/mapper/…   ext4          98.0        33.0        67.0   33%  ███▓▓▓▓▓▓▓
```

Cells turn yellow at ≥75 % use and red at ≥90 %.

## Quick start

### From source (current path until v0.1.0 hits npm)

```sh
git clone https://github.com/pathcosmos/cli-ascii-usage
cd cli-ascii-usage
npm install
npm run build
node dist/cli.js              # run once
npm link                      # optional: expose `dleft` globally
```

### From npm

```sh
npm install -g @pathcosmos/dleft
# or one-shot:
npx @pathcosmos/dleft
```

The bin name is `dleft` (so the global install gives you `dleft`, not `pathcosmos-dleft`). Requires Node.js ≥ 22. Single-file ESM bundle, no postinstall hooks.

## Usage

```sh
dleft [options]
```

| Flag | Description | Default |
|---|---|---|
| `-j`, `--json` | Emit JSON (`schemaVersion: 1`); suppresses color. | off |
| `-a`, `--all` | Include pseudo-filesystems (tmpfs, overlay, etc.). | off |
| `-s`, `--sort <field>` | Sort by `size` / `used` / `free` / `use%` / `name`. | `size` |
| `--si` | SI units (KB, GB, TB) instead of IEC (KiB, GiB, TiB). | IEC |
| `--no-bars` | Hide the bar column. | bars on |
| `--no-color` | Disable ANSI color. Respects `NO_COLOR` env. | auto |
| `--only <section>` | Render only `disks` or `fs`. | both |
| `-h`, `--help` | Show help. | — |
| `-V`, `--version` | Print version. | — |

### Recipes

```sh
dleft --sort use%             # which mounts are full?
dleft -a                      # show tmpfs, overlay, etc.
dleft --only disks            # just the physical-disk summary
dleft --no-color > usage.txt  # capture for diff later
dleft --json | jq '.filesystems[] | select(.usedBytes / .sizeBytes > 0.9) | .mountpoint'
```

### Environment

- `NO_COLOR=1` — disables color (standard).
- `DLEFT_ASCII=1` — forces ASCII bar chars (`#`, `-`) instead of unicode blocks.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Success (may still emit warnings to stderr). |
| `1` | Fatal: unsupported platform, missing required command, parse failure. |
| `2` | Invalid argument. |

## How it works

```
                ┌──────────────────────┐
                │   src/cli.ts         │  parseArgs → RenderOptions
                └────────────┬─────────┘
                             │
        ┌────────────────────┴────────────────────┐
        ▼                                         ▼
┌──────────────────┐                    ┌──────────────────┐
│ collectors/      │                    │ render/          │
│  ├ darwin.ts     │  diskutil + df     │  ├ disks.ts      │
│  ├ linux.ts      │  lsblk   + df      │  ├ filesystems.ts│
│  └ index.ts      │                    │  ├ bar / unit /  │
└────────┬─────────┘                    │  │  color / width│
         │ DiskReport                   │  └ index.ts      │
         └─────────────────►─────────────►  pure(): string │
                                        └──────────────────┘
```

- **Collectors** spawn subprocesses through a `CommandRunner` interface (DI seam) and parse output into a `DiskReport`. The production runner uses Node's `execFile` with a fixed argv array — no shell, no injection surface — and a 5-second timeout. Tests use a `FakeRunner` seeded from committed fixtures.
- **Render** is a pure function: `render(report, opts) → string`. No stdout, no env, no TTY checks. All environmental decisions (color, width, unicode) happen in `cli.ts` and are passed in.
- A timeout on one data source emits a warning and the others still render (partial success → exit 0).

## Platform notes

| Platform | Required commands |
|---|---|
| macOS | `diskutil`, `df` |
| Linux | `lsblk`, `df` |

### macOS: APFS containers

One physical-disk row per APFS container. Used bytes come from container-level `CapacityCeiling - CapacityFree`, **not** Σ per-volume `CapacityInUse` — summing volume usage double-counts shared space across APFS volumes in the same container. If `diskutil apfs list` times out, the disk summary is omitted with a warning rather than inferred from `df` (silently wrong numbers in a disk-space tool are worse than fewer numbers).

### Linux: LVM, LUKS, overlay

Filesystems are joined to physical disks by walking the `lsblk` tree. LVM volumes and LUKS-backed partitions map to their parent block device. Bind mounts and overlay filesystems are flagged as pseudo and hidden by default (`--all` to show).

## JSON output

```sh
dleft --json
```

Emits a `DiskReport` document. The shape is stable under `schemaVersion: 1`; gate downstream consumers on that field:

```sh
dleft --json | jq 'if .schemaVersion == 1 then .filesystems else error("unexpected dleft schema") end'
```

`schemaVersion` will only bump on a breaking change to the report shape — non-breaking additions keep `1`.

## Why not just `df`?

- `df` doesn't show physical-disk totals or APFS container reconciliation.
- `df` output alignment breaks on long device paths (`/dev/mapper/…`).
- `df` doesn't know about bind mounts, pseudo-filesystems, or LVM parent disks.
- `dleft` isn't a replacement — it's a denser skim for "where is my space?"

## Development

```sh
npm install
npm test           # Vitest: unit + collectors + CLI + smoke (~1.4 s)
npm run typecheck  # tsc --noEmit
npm run build      # tsup → dist/cli.js (12 KB ESM bundle, shebang)
node dist/cli.js   # run the built bundle
```

Fixtures live under `tests/fixtures/{darwin,linux}/`. `FakeRunner` (`tests/helpers/fake-runner.ts`) injects fixture strings so collector tests run the real parser without spawning subprocesses. Refresh fixtures via the snippets in `tests/fixtures/README.md`.

CI matrix: Node 22 / 24 × Ubuntu / macOS. Releases publish to npm via OIDC keyless provenance on `v*` tag push.

## License

MIT. See [LICENSE](./LICENSE).
