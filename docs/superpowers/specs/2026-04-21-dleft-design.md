# dleft — Design Spec

**Date:** 2026-04-21
**Status:** Draft, pending user review

---

## 1. Intent

`dleft` is a read-only CLI that renders disk usage — physical disks and mounted filesystems — as ASCII tables and bar graphs in the terminal. It targets **macOS and Linux** developers and sysadmins who currently squint at `df -h` / `diskutil list` / `lsblk` output and want a denser, color-coded, one-look summary.

Name: "disk left" → how much space is left on your disks.

## 2. Scope

### In scope (v1)

- Single command `dleft`, one-shot output (prints and exits)
- Combo view: physical disk summary on top, mounted filesystem table below
- JSON output mode for scripting
- Pseudo-filesystem filtering (tmpfs, devfs, overlay) with opt-in `--all`
- Adaptive layout to terminal width
- Color thresholds on use% (≥90 red, ≥75 yellow)
- IEC units by default (`GiB`/`TiB`), `--si` for decimal

### Out of scope (v1)

- Interactive TUI / keyboard navigation (no drill-down)
- `--watch` / refreshing output (structure allows it later; not shipped)
- Windows support
- Per-directory disk usage (`du`-style) — that's `ncdu` territory
- SMART data, IOPS, throughput
- Network filesystems treated specially (NFS/SMB just appear as regular fs rows)

## 3. User-facing surface

### Default output

```
PHYSICAL DISKS
  disk0  APPLE SSD AP1024M       1.0T  [████████████░░░░░░░░]  612G used / 412G free  (60%)
  disk1  Samsung T7 Shield       2.0T  [██████░░░░░░░░░░░░░░]  612G used / 1.4T free  (30%)

FILESYSTEMS
  MOUNT                FS      SIZE    USED    FREE   USE%
  /                    apfs    994G    612G    382G   61%   [████████████░░░░░░░░]
  /System/Volumes/Data apfs    994G     38G    382G    9%   [██░░░░░░░░░░░░░░░░░░]
  /Volumes/T7          exfat   1.8T    612G    1.2T   33%   [███████░░░░░░░░░░░░░]
  /mnt/backup          ext4    500G    486G     14G   97%   [███████████████████▓]
```

Rows with use% ≥90 are colored red; ≥75 yellow.

### Flags

| Flag | Purpose | Default |
|---|---|---|
| `-j`, `--json` | Emit `DiskReport` JSON instead of rendered ASCII | off |
| `-a`, `--all` | Include pseudo-filesystems | off (pseudo-fs hidden) |
| `-s`, `--sort <field>` | `size` \| `used` \| `free` \| `use%` \| `name` | `size` (desc) |
| `--si` | SI units (1000-base, `GB`/`TB`) | off (IEC, 1024-base) |
| `--no-bars` | Omit bar graph column (awk/cut friendly) | off |
| `--no-color` | Force color off | off (auto-detect via TTY + NO_COLOR) |
| `--only <disks\|fs>` | Emit only one section | both |
| `--help`, `--version` | Standard | — |

### Behavior rules

- **Units**: IEC (1024-base) by default. Column-consistent — whole column uses one unit based on the max value in that column (prevents `612G` next to `1.4T` visual jitter).
- **Filtering**: Hide `tmpfs`, `devfs`, `overlay`, `squashfs`, `autofs`, `fuse.gvfsd-*` by default. `--all` disables filtering.
- **Sorting**: `size` descending by default. `--sort name` ascending, all others descending.
- **Bar width**: adaptive. `clamp(terminal_cols − fixed_column_budget, 10, 30)`.
- **Mountpoint truncation**: when terminal too narrow, elide middle segments with `…` (preserve start and end).
- **Color suppression**: `useColor = !flag.noColor && !env.NO_COLOR && stdout.isTTY && !flag.json`.
- **Unicode/ASCII**: Default bar uses `█▉▊▋▌▍▎▏▓`. Fallback to `#`/`-` if `LANG`/`LC_ALL` lacks `UTF-8` or `DLEFT_ASCII=1`.

### Exit codes

- `0` — success (including when some collectors had non-fatal warnings)
- `1` — collector total failure, missing required system command, unsupported platform
- `2` — invalid argument / usage error

## 4. Data model

All sizes in **bytes** as `number`. Node's `number` is safe to 2^53 ≈ 9 PB, which covers any realistic disk. Canonicalize to bytes in collectors so renderers never think about units.

```ts
// src/model.ts
export type DiskReport = {
  platform: 'darwin' | 'linux';
  collectedAt: Date;
  physicalDisks: PhysicalDisk[];
  filesystems: Filesystem[];
  warnings: string[];
};

export type PhysicalDisk = {
  id: string;              // 'disk0', '/dev/sda'
  model?: string;          // 'APPLE SSD AP1024M'
  sizeBytes: number;
  usedBytes: number;       // aggregated; see APFS note below
  freeBytes: number;
};

export type Filesystem = {
  mountpoint: string;
  device: string;          // '/dev/disk1s1', '/dev/sda2'
  fstype: string;          // 'apfs', 'ext4', 'exfat'
  sizeBytes: number;
  usedBytes: number;
  freeBytes: number;
  physicalDiskId?: string; // links to PhysicalDisk.id; undefined if unmappable
  isPseudo: boolean;       // hidden unless --all
};
```

## 5. Collectors

Each collector implements `collect(runner: CommandRunner): Promise<DiskReport>`. The `CommandRunner` interface is dependency-injected so tests can feed fixture output without spawning subprocesses.

```ts
export interface CommandRunner {
  run(cmd: string, args: string[], opts?: { timeoutMs?: number }): Promise<string>;
}
```

### Safe subprocess invocation (security-critical)

The default runner wraps Node's `execFile` from `node:child_process` — **never** the shell-interpreting variant. All system commands are invoked with the program name and an array of arguments; no string concatenation, no shell expansion, no user input interpolated anywhere in the command construction. Arguments are fixed constants (e.g. `['list', '-plist']`), not derived from flags or env. This forecloses command-injection at the design level.

A 5-second hard timeout per invocation protects against hung system tools (observed in the wild: stuck `diskutil` on a failing APFS volume). Timeouts emit a warning and skip that data source; the rest of the report still renders.

### `collectors/darwin.ts`

- `diskutil list -plist` — physical disks and partition map
- `diskutil apfs list -plist` — APFS container membership
- `df -kP` — mounted filesystem size/used/free (POSIX mode, stable block size)

**APFS handling** — the key correctness trap: multiple APFS volumes share a container's free space. Summing per-volume `used` **double-counts**. Design:

- One `PhysicalDisk` per APFS **container** (not per disk slice).
- Container's `usedBytes` = container-level figure from `diskutil apfs list` (not `Σ volume.used`).
- Each volume becomes a `Filesystem` with `physicalDiskId` pointing to the container.

### `collectors/linux.ts`

- `lsblk -J -b -o NAME,KNAME,SIZE,TYPE,MODEL,MOUNTPOINT,FSTYPE` — block device tree, bytes
- `df -kPT` — mounted filesystem real used/free with fs type

**Mapping**: `lsblk` entries with `TYPE=disk` become `PhysicalDisk`. Children (`part`, `lvm`, `crypt`) become `Filesystem` candidates, joined with `df` rows by device path. LVM/LUKS require walking the tree up to find the physical parent; if ambiguous, `physicalDiskId = undefined` and a warning is emitted.

### `collectors/index.ts`

Dispatch on `process.platform`. `darwin`/`linux` supported; anything else throws a friendly error.

## 6. Rendering pipeline

`render(report, opts)` is a **pure function** returning a string. Stdout writing lives in `cli.ts`. This makes rendering tests fast (no spawn, no TTY) and deterministic.

```
src/render/
  index.ts        — orchestrates; handles --json bypass and --only filtering
  disks.ts        — PHYSICAL DISKS section
  filesystems.ts  — FILESYSTEMS table
  bar.ts          — renderBar(ratio, width, opts) → string, no color
  unit.ts         — formatBytes(n, base) + column-consistent unit selection
  color.ts        — picocolors wrapper + threshold constants
  width.ts        — terminal width calc + mountpoint truncation
```

**No `cli-table3`.** Hand-rolled with `string-width` + `padEnd`/`padStart` — ~30 LOC, full control, avoids color-code alignment bugs in third-party table libs.

**Threshold constants** (export from `color.ts`):
- `THRESHOLD_DANGER = 0.90`
- `THRESHOLD_WARN = 0.75`

**Runtime dependencies (v1):**
- `picocolors` — color
- `string-width` — wide-character column math

Everything else is Node stdlib (`node:child_process` — `execFile` only; `node:util` — `parseArgs`; `node:os`).

## 7. Errors & edge cases

| Case | Behavior | Exit |
|---|---|---|
| Normal run | render to stdout | 0 |
| Partial collector failure | warning to stderr, remaining data rendered | 0 |
| Total collector failure | error to stderr with hint | 1 |
| Required command not found | `error: 'diskutil' not found on PATH — is this macOS 10.15+?` | 1 |
| Unsupported platform | `error: dleft supports macOS and Linux only (got: win32)` + repo URL | 1 |
| Invalid CLI argument | usage line to stderr | 2 |
| Command timeout (>5s) | warning, skip that data source | 0 |

All errors go to **stderr**. Only the report (or `--json` payload) goes to stdout, keeping `dleft | jq` clean.

## 8. Testing

### Fixtures

```
tests/fixtures/
  darwin/
    diskutil-list.plist
    diskutil-apfs-list.plist
    df-kP.txt
  linux/
    lsblk.json
    df-kPT.txt
```

Captured from real machines and committed.

### Test layers

1. **Collector unit tests** — feed fixtures through a `FakeRunner`, assert `DiskReport` shape. Lets macOS devs test Linux code and vice versa.
2. **Render snapshot tests** — `expect(render(report, opts)).toMatchSnapshot()`. Covers default output, `--json`, `--no-color`, `--all`, each `--sort` option.
3. **Width responsiveness** — snapshots at widths 40, 80, 120, 200.
4. **Unit formatting boundaries** — 1023 B, 1024 B, 999.5 GiB, 1 TiB exactly.
5. **Color-off invariant** — when `useColor=false`, output contains zero ANSI escape bytes.

### Tooling

- `vitest` — ESM-native, built-in snapshot, fast.

### CI

`.github/workflows/ci.yml` — matrix `{node: [22, 24]} × {os: [ubuntu-latest, macos-latest]}`. Runs `npm test`, `npm run build`, plus a smoke test invoking `node dist/cli.js` and asserting exit 0.

## 9. Build & publish

### Build — `tsup`

```ts
// tsup.config.ts
export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node22',
  banner: { js: '#!/usr/bin/env node' },
  minify: true,
  sourcemap: true,
  clean: true,
});
```

Produces `dist/cli.js` (single bundle, shebang embedded).

### `package.json`

```jsonc
{
  "name": "dleft",
  "version": "0.1.0",
  "type": "module",
  "bin": { "dleft": "./dist/cli.js" },
  "files": ["dist", "README.md", "LICENSE"],
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "prepublishOnly": "npm run build && npm test"
  },
  "license": "MIT"
}
```

### Publish flow

- Initial `v0.1.0` placeholder publish to claim the name on npm.
- Subsequent releases: `.github/workflows/release.yml` triggers on `v*` tag push. Uses npm's OIDC-based keyless publishing with `--provenance --access public`. No long-lived npm auth token stored in CI.
- Semver: `0.x.y` allows breaking output changes. Stabilize → `1.0.0` when layout and flag surface settle.

### Dev dependencies

- `typescript`
- `tsup`
- `vitest`
- `@types/node`

### License

MIT.

### README

Install, animated SVG screenshot (via `svg-term-cli`), flag table, platform support matrix, contributing, license. English.

## 10. Non-obvious design decisions (for future-me)

- **`CommandRunner` DI over module-level mocking** — ESM hoisting makes module-level subprocess-module mocking brittle and couples fixture loading to the test runner. An interface makes the seam explicit in the function signature.
- **IEC by default, not SI** — macOS `diskutil` uses decimal, Linux `df -h` uses binary, `df --si` uses decimal. There is no correct cross-platform default. We pick IEC because filesystem block sizes are powers of two and `duf` set the de-facto precedent.
- **Pseudo-fs hidden by default** — `df`'s "show everything" default is useful for kernel folks but noisy for everyone else. The whole point of this tool is "show me what I care about."
- **Rendering is pure** — `render()` takes no env, no TTY, no argv. All environmental decisions (color, width, unicode support) happen in `cli.ts` and arrive as `RenderOptions`. This is what makes snapshot tests work at all.
- **Column-consistent units** — picking a unit per cell produces visual jitter (`612G` / `1.4T` in adjacent rows). Picking per column based on max value is uniform and still honest.
- **Warnings as data, not exceptions** — one unmappable volume shouldn't nuke the whole report. Collector failure partitions into (fatal: throw) vs (non-fatal: append to `report.warnings`).
- **Never shell out; always execFile with arg arrays** — there is no user-supplied input that ever reaches a subprocess argument, but the policy is enforced at the design level anyway: the runner interface does not accept a single command string.

## 11. Deferred / open

None blocking v1. Candidates for v0.2+:
- `--watch` refresh loop (structure already supports it)
- Per-disk SMART summary
- Homebrew tap formula
- Drill-down into a selected disk (would require TUI — bigger scope rethink)

## 12. References

- [`duf`](https://github.com/muesli/duf) — Go CLI, very close aesthetic and scope. Primary prior art.
- [`ncdu`](https://dev.yorhel.nl/ncdu) — per-directory `du` explorer. Different problem.
- [`gdu`](https://github.com/dundee/gdu) — fast `du` replacement. Different problem.
- macOS `diskutil` man page, APFS architecture notes.
- Linux `lsblk` JSON schema — `util-linux` source.
