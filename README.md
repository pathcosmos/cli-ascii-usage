# dleft

ASCII disk usage for macOS and Linux — physical disks, partitions, and mounted filesystems, rendered as dense tables with usage bars.

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

Read-only — never mutates disk state.

## Install

```sh
npm install -g dleft
```

Requires Node.js ≥22. Single-file ESM bundle, no postinstall hooks.

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

### Environment

- `NO_COLOR=1` — disables color (standard).
- `DLEFT_ASCII=1` — forces ASCII bar chars (`#`, `-`) instead of unicode blocks.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Success (may still emit warnings to stderr). |
| `1` | Fatal: unsupported platform, missing required command, parse failure. |
| `2` | Invalid argument. |

## Platform support

| Platform | Required commands |
|---|---|
| macOS | `diskutil`, `df` |
| Linux | `lsblk`, `df` |

Subprocess invocations use `execFile` with fixed argv arrays — no shell, no injection surface. Each command has a 5-second timeout; a timeout emits a warning and the other data sources still render (partial success → exit 0).

### macOS: APFS containers

One physical-disk row per APFS container. Used bytes come from container-level `CapacityCeiling - CapacityFree`, not Σ per-volume `CapacityInUse` — summing volume usage double-counts shared space across APFS volumes in the same container.

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

## Why not just `df`?

- `df` doesn't show physical-disk totals or APFS container reconciliation.
- `df` output alignment breaks on long device paths (`/dev/mapper/…`).
- `df` doesn't know about bind mounts, pseudo-filesystems, or LVM parent disks.
- `dleft` doesn't replace `df` — it gives you a denser skim for "where is my space?"

## Development

```sh
npm install
npm test          # Vitest suite (unit + collector + CLI + smoke)
npm run typecheck # tsc --noEmit
npm run build     # bundle to dist/cli.js
node dist/cli.js  # run the built bundle
```

Fixtures under `tests/fixtures/{darwin,linux}/`. `FakeRunner` (see `tests/helpers/fake-runner.ts`) injects fixture strings so collector tests run the real parser without spawning subprocesses.

## License

MIT. See [LICENSE](./LICENSE).
