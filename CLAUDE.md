# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project intent

A CLI utility that renders disk usage — physical disks, partitions, and mounted filesystems — as ASCII tables and/or bar-graphic visualizations in the terminal. Target platforms: **Linux and macOS**.

Surface the same information `df`, `diskutil`, and `lsblk` already expose, but in a denser, more readable layout (used/free bars, partition trees, etc.). Read-only: this tool never mutates disk state.

## Current state

The repository is a **greenfield scaffold**. There is no source code, no build system, no package manifest, and no language choice yet. The only existing content is `.remember/` (session-memory scaffolding from the `remember` skill — not part of the shipped tool).

**Before writing code, confirm with the user:**
- Implementation language (Go, Rust, Python, Node, shell — each has different tradeoffs for static binaries vs. quick iteration).
- Distribution target (single static binary? Homebrew/apt package? pipx/npm?).
- Whether to shell out to `df`/`diskutil`/`lsblk` (fast to ship, cross-platform parsing pain) vs. call platform syscalls directly (`statvfs`, `IOKit`, `/proc/mounts`).

Do **not** assume any of these from prior conventions — this repo has none.

## Platform-specific data sources

When the tool is implemented, these are the canonical sources to reconcile:

| Info | Linux | macOS |
|---|---|---|
| Mounted filesystems + usage | `/proc/mounts`, `statvfs()`, `df -kP` | `getmntinfo()`, `statfs()`, `df -kP` |
| Partitions / block devices | `/proc/partitions`, `lsblk -J` | `diskutil list -plist`, IOKit |
| Physical disk → partition mapping | `lsblk` tree, `/sys/block/` | `diskutil info -plist <disk>` |

Key gotchas to handle once code exists:
- macOS APFS containers share space across multiple volumes — summing per-volume `used` double-counts. Use `diskutil apfs list` or container-level data.
- Linux bind mounts and overlay filesystems appear in `/proc/mounts` but don't represent new storage. Filter or de-duplicate by device.
- Both platforms expose pseudo-filesystems (`tmpfs`, `devfs`, `overlay`) that usually shouldn't appear in a "disk usage" view by default.

## Build / test / run

Not yet defined — populate this section in the same change that introduces the build system, so instructions never drift from reality.

## Repository conventions

None established yet. Once the first real code lands, add notes here for anything non-obvious: module layout, where rendering logic lives vs. platform probes, how fixtures for `df`/`lsblk`/`diskutil` output are stored for tests, etc.
