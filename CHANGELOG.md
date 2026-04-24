# Changelog

All notable changes to `dleft` are documented here. Format: [Keep a Changelog](https://keepachangelog.com/), [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-04-24

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
