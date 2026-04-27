# Changelog

All notable changes to `dleft` are documented here. Format: [Keep a Changelog](https://keepachangelog.com/), [Semantic Versioning](https://semver.org/).

## [0.1.2] - 2026-04-27

### Changed
- CI release workflow now uses npm OIDC trusted publishing (no NPM_TOKEN secret required). Provenance attestation is unchanged.
- Added npm version badge to README.

## [0.1.1] - 2026-04-27

### Fixed
- `dleft --version` (and any other invocation) silently exited 0 with no output when run through a symlinked path — including npm's `.bin/dleft` shim and macOS `/tmp` → `/private/tmp`. Root cause: `isEntryPoint()` compared `import.meta.url` (symlink-resolved) against `pathToFileURL(argv[1])` (raw), so they mismatched. Fix: realpath argv[1] before the comparison. Regression test in `tests/smoke.test.ts`.

### Changed
- Renamed package to `@pathcosmos/dleft` (npm rejected the unscoped `dleft` as too similar to `defu`). The `dleft` bin command name is unchanged.

## [0.1.0] - 2026-04-27

### Added
- CLI entry (`dleft`) with `util.parseArgs`-based flag handling.
- Platform collectors:
  - macOS via `diskutil list -plist`, `diskutil apfs list -plist`, `df -kP`.
  - Linux via `lsblk -J -b -o NAME,KNAME,SIZE,TYPE,MODEL,MOUNTPOINT,FSTYPE`, `df -kPT`.
- APFS container reconciliation (container-level `CapacityCeiling - CapacityFree`, never Σ per-volume to avoid double-counting shared space).
- Subprocess sandbox: `execFile` + fixed argv + 5 s timeout. No shell invocation.
- ASCII / unicode bar graph rendering, column-consistent unit selection (IEC default, SI via `--si`).
- Sort by `size` / `used` / `free` / `use%` / `name`.
- Pseudo-filesystem filter (tmpfs, overlay, devfs, autofs, squashfs, fuse.gvfsd-\*) — `--all` to show.
- `--json` output with `schemaVersion: 1` for stable downstream parsing.
- `--only disks` / `--only fs` to restrict sections.
- `--no-color` flag; respects `NO_COLOR` env; `DLEFT_ASCII=1` forces ASCII bars.
- Exit-code matrix: 0 success, 1 fatal, 2 invalid argument.
- Test fixtures under `tests/fixtures/{darwin,linux}/` with a `FakeRunner` DI layer.
- CI matrix (Node 22 + 24 on Ubuntu + macOS).
- Keyless npm publish from GitHub Actions with `--provenance`.
