# Collector fixtures

## Contents

- `darwin/diskutil-list.plist` — real `diskutil list -plist` (captured 2026-04-24 on an M-series Mac).
- `darwin/diskutil-apfs-list.plist` — real `diskutil apfs list -plist` from the same host.
- `darwin/df-kP.txt` — real `df -kP` output from the same host.
- `linux/lsblk.json` — **synthetic** `lsblk -J -b -o NAME,KNAME,SIZE,TYPE,MODEL,MOUNTPOINT,FSTYPE`; modeled on an Ubuntu 24.04 server with a 512 GB root SSD (LVM: /, /home, swap) + a 2 TB secondary disk on /mnt/data.
- `linux/df-kPT.txt` — **synthetic** `df -kPT` aligned with the lsblk fixture; includes tmpfs, overlay, and LVM-backed ext4 mounts so the pseudo-fs filter + LVM-to-disk mapping both get exercised.

## Updating fixtures

Darwin:
```sh
diskutil list -plist > tests/fixtures/darwin/diskutil-list.plist
diskutil apfs list -plist > tests/fixtures/darwin/diskutil-apfs-list.plist
df -kP > tests/fixtures/darwin/df-kP.txt
```

Linux (replace synthetic set with real capture):
```sh
lsblk -J -b -o NAME,KNAME,SIZE,TYPE,MODEL,MOUNTPOINT,FSTYPE > tests/fixtures/linux/lsblk.json
df -kPT > tests/fixtures/linux/df-kPT.txt
```

Scrub volume names / UUIDs before committing if they reveal anything you don't
want in git history. The fixtures currently checked in have been grep'd for the
usual suspects.

## Scope

Consider this an **initial set**, not a complete library. Expand when bugs
surface — LVM-on-LUKS, APFS volume snapshots, bind mounts, and ZFS are all
known-interesting scenarios that are not yet represented.
