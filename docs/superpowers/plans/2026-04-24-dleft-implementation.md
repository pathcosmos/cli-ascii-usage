# dleft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note on file location:** During plan-mode review this document lives at `/Users/lanco/.claude/plans/lively-popping-lerdorf.md`. After approval it should be copied to `docs/superpowers/plans/2026-04-24-dleft-implementation.md` (superpowers convention) before execution begins.

**Goal:** Ship `dleft` v0.1.0 to npm — a TypeScript CLI that prints disk/partition/filesystem usage as ASCII tables + bar graphs on Linux and macOS, reading data from `diskutil`/`lsblk`/`df` via a sandboxed subprocess layer.

**Architecture:** Three layers — collectors (platform-specific subprocess + parse → `DiskReport`), pure render (`render(report, opts) → string`), thin CLI (argv, env, TTY → `RenderOptions`). Testability comes from a `CommandRunner` DI interface; every collector test uses a `FakeRunner` seeded from committed fixture strings. No file I/O or process spawning inside render; all environmental decisions happen in `cli.ts`.

**Tech Stack:** Node.js ≥22 (ESM, `util.parseArgs`), TypeScript, tsup (single-bundle ESM build), Vitest (ESM-native), picocolors (zero-dep ANSI), string-width (CJK-safe column padding), plist parser (macOS), GitHub Actions + npm OIDC keyless publish (`--provenance --access public`).

---

## Context

**Why this change:** Repo is a greenfield scaffold. The design spec at `docs/superpowers/specs/2026-04-21-dleft-design.md` was approved via brainstorming. `CLAUDE.md` captures intent + platform data-source gotchas (APFS container double-count, Linux pseudo-fs). No source code exists yet. This plan converts the spec into a TDD-ordered task sequence that produces working, publishable software.

**Resolved decisions (baked in, call out during review if you disagree):**
1. **argv parser:** Node 22's built-in `util.parseArgs` — zero dep, sufficient for 8 flags, no subcommands.
2. **JSON schema versioning:** `DiskReport.schemaVersion = 1` committed in the type. Downstream `jq` consumers can gate on it. Bump rule: breaking shape changes only.
3. **APFS timeout behavior:** On `diskutil apfs list` timeout, omit `physicalDisks` entirely and emit a `warnings[]` entry + stderr line; render the FILESYSTEMS table from `df` as usual. Never infer APFS containers from `df` (would double-count and silently lie).

**Fixtures caveat (from Plan-agent risk review):** `tests/fixtures/{darwin,linux}/` ships an initial set captured once; mark the collection as "expand when bugs surface," not "complete." LVM/APFS snapshot edge cases will need to be added incrementally.

**Sequencing constraints (locked to prevent retrofit):**
- `model.ts` must include `PhysicalDisk.usedBytes` docstring "container-level used, not Σ volume.used" **before** any collector is written.
- `model.ts` must define `RenderOptions` **before** render modules are written.
- `model.ts` stays types-only: no runtime imports. `defaultRunner` lives in `src/runner.ts`, not `model.ts`.
- `unit.ts::pickColumnUnit` takes `number[]`, not domain types — render callers extract columns.
- `FakeRunner` key format `${cmd} ${args.join(' ')}` is locked in its first test; changing it later means rewriting every collector test.

---

## File Structure

```
cli-ascii-usage/
├── src/
│   ├── cli.ts                  # main entry (shebang via tsup banner)
│   ├── model.ts                # types + CommandRunner interface (types-only)
│   ├── runner.ts               # defaultRunner: execFile wrapper w/ 5s timeout
│   ├── collectors/
│   │   ├── index.ts            # platform dispatch
│   │   ├── darwin.ts           # diskutil + df → DiskReport; APFS reconciliation
│   │   └── linux.ts            # lsblk + df → DiskReport; LVM/LUKS walk
│   └── render/
│       ├── index.ts            # orchestration, --json bypass, --only filter
│       ├── disks.ts            # PHYSICAL DISKS section
│       ├── filesystems.ts      # FILESYSTEMS table
│       ├── bar.ts              # renderBar(ratio, width, opts) — pure
│       ├── unit.ts             # formatBytes, pickColumnUnit — pure
│       ├── color.ts            # picocolors wrapper + threshold constants
│       └── width.ts            # getTerminalWidth, truncateMiddle
├── tests/
│   ├── helpers/
│   │   └── fake-runner.ts
│   ├── fixtures/
│   │   ├── darwin/{diskutil-list.plist, diskutil-apfs-list.plist, df-kP.txt}
│   │   └── linux/{lsblk.json, df-kPT.txt}
│   ├── model.test.ts
│   ├── render/{unit,bar,color,width,disks,filesystems,index}.test.ts
│   ├── collectors/{darwin,linux,index}.test.ts
│   ├── cli.test.ts
│   └── smoke.test.ts
├── .github/workflows/{ci.yml, release.yml}
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── .gitignore
├── .npmignore
├── LICENSE
├── README.md
└── CHANGELOG.md
```

---

## Task list (19 tasks, 7 phases)

### Phase A — Scaffold

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `.gitignore`, `.npmignore`, `LICENSE` (MIT text with year 2026 and holder per `git config user.name`).

- [ ] **Step 1: Write `package.json`** — `{ "name": "dleft", "version": "0.1.0", "type": "module", "bin": { "dleft": "./dist/cli.js" }, "files": ["dist", "README.md", "LICENSE"], "engines": { "node": ">=22" }, "scripts": { "build": "tsup", "test": "vitest run", "test:watch": "vitest", "typecheck": "tsc --noEmit", "prepublishOnly": "npm run build" }, "license": "MIT", "devDependencies": { "typescript": "^5.4.0", "tsup": "^8.0.0", "vitest": "^1.4.0", "@types/node": "^22.0.0", "plist": "^3.1.0", "@types/plist": "^3.0.5", "picocolors": "^1.0.0", "string-width": "^7.0.0" } }`.
- [ ] **Step 2: Write `tsconfig.json`** — `{ "compilerOptions": { "target": "es2022", "module": "nodenext", "moduleResolution": "nodenext", "strict": true, "noUncheckedIndexedAccess": true, "esModuleInterop": true, "skipLibCheck": true, "resolveJsonModule": true, "declaration": false, "isolatedModules": true, "verbatimModuleSyntax": true }, "include": ["src", "tests"] }`.
- [ ] **Step 3: Write `tsup.config.ts`** — `import { defineConfig } from 'tsup'; export default defineConfig({ entry: ['src/cli.ts'], format: ['esm'], target: 'node22', banner: { js: '#!/usr/bin/env node' }, minify: true, sourcemap: true, clean: true, platform: 'node' });`.
- [ ] **Step 4: Write `vitest.config.ts`** — `import { defineConfig } from 'vitest/config'; export default defineConfig({ test: { include: ['tests/**/*.test.ts'], globals: false } });`.
- [ ] **Step 5: Write `.gitignore`** — `node_modules/\ndist/\n*.log\n.DS_Store\ncoverage/`.
- [ ] **Step 6: Write `.npmignore`** — `src/\ntests/\ndocs/\n.remember/\n.github/\n.claude/\n*.config.ts\ntsconfig.json`.
- [ ] **Step 7: Run `npm install`** — verify lockfile generated, no errors.
- [ ] **Step 8: Run `npm test`** — expect `No test files found, exiting with code 0`.
- [ ] **Step 9: Commit** — `feat: project scaffold (package.json, tsup, vitest, tsconfig)`.

### Phase B — Pure modules

### Task 2: Model types

**Files:**
- Create: `src/model.ts`, `tests/model.test.ts`

- [ ] **Step 1: Write failing test** (`tests/model.test.ts`)

```typescript
import { describe, it, expectTypeOf } from 'vitest';
import type { DiskReport, PhysicalDisk, Filesystem, CommandRunner, RenderOptions } from '../src/model.js';

describe('model', () => {
  it('DiskReport has schemaVersion literal 1', () => {
    const r: DiskReport = {
      schemaVersion: 1, platform: 'darwin', collectedAt: new Date(),
      physicalDisks: [], filesystems: [], warnings: [],
    };
    expectTypeOf(r.schemaVersion).toEqualTypeOf<1>();
  });

  it('CommandRunner.run returns Promise<string>', () => {
    const fake: CommandRunner = { run: async () => '' };
    expectTypeOf(fake.run).returns.resolves.toBeString();
  });
});
```

- [ ] **Step 2: Run test, expect TS compile fail** — `npx vitest run tests/model.test.ts` → FAIL "Cannot find module '../src/model.js'".

- [ ] **Step 3: Write `src/model.ts`**

```typescript
export interface DiskReport {
  /** Bump on breaking change to DiskReport shape only. */
  schemaVersion: 1;
  platform: 'darwin' | 'linux';
  collectedAt: Date;
  physicalDisks: PhysicalDisk[];
  filesystems: Filesystem[];
  warnings: string[];
}

export interface PhysicalDisk {
  id: string;
  model?: string;
  sizeBytes: number;
  /** Container-level used, NOT Σ volume.used (APFS double-counts). */
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
  physicalDiskId?: string;
  isPseudo: boolean;
}

export interface CommandRunner {
  run(cmd: string, args: readonly string[], opts?: { timeoutMs?: number }): Promise<string>;
}

export interface RenderOptions {
  useColor: boolean;
  width: number;
  unicode: boolean;
  showBars: boolean;
  showAll: boolean;
  only?: 'disks' | 'fs';
  sort: 'size' | 'used' | 'free' | 'use%' | 'name';
  base: 1024 | 1000;
  json: boolean;
}
```

- [ ] **Step 4: Run test, expect PASS** — `npx vitest run tests/model.test.ts`.

- [ ] **Step 5: Commit** — `feat(model): DiskReport, CommandRunner, RenderOptions types`.

### Task 3: Unit formatting

**Files:**
- Create: `src/render/unit.ts`, `tests/render/unit.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { formatBytes, pickColumnUnit } from '../../src/render/unit.js';

describe('formatBytes (IEC, base=1024)', () => {
  it.each([
    [0, 1024, '0 B'],
    [1023, 1024, '1023 B'],
    [1024, 1024, '1.0 KiB'],
    [1024 ** 3, 1024, '1.0 GiB'],
    [1024 ** 4, 1024, '1.0 TiB'],
    [Math.floor(999.5 * 1024 ** 3), 1024, '999.5 GiB'],
  ])('formatBytes(%i, %i) === %s', (n, base, expected) => {
    expect(formatBytes(n, base as 1024 | 1000)).toBe(expected);
  });
});

describe('pickColumnUnit', () => {
  it('picks GiB when max < 1 TiB', () => {
    expect(pickColumnUnit([1024 ** 3, 5 * 1024 ** 3], 1024)).toBe('GiB');
  });
  it('picks TiB when any value >= 1 TiB', () => {
    expect(pickColumnUnit([1024 ** 3, 2 * 1024 ** 4], 1024)).toBe('TiB');
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (module not found).
- [ ] **Step 3: Implement** `src/render/unit.ts` — `formatBytes(n, base)` picks unit by `Math.floor(Math.log(n) / Math.log(base))`, formats to 1 decimal (0 decimals for `B`). `pickColumnUnit(values, base)` returns unit label for `Math.max(...values)`. Units: IEC `[B, KiB, MiB, GiB, TiB, PiB]` when base=1024; SI `[B, KB, MB, GB, TB, PB]` when base=1000.
- [ ] **Step 4: Run, expect PASS**.
- [ ] **Step 5: Commit** — `feat(render): formatBytes + pickColumnUnit with IEC/SI bases`.

### Task 4: Bar graph rendering

**Files:**
- Create: `src/render/bar.ts`, `tests/render/bar.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { renderBar } from '../../src/render/bar.js';

describe('renderBar', () => {
  it('width=20, ratio=0.5, unicode → 10 full blocks + 10 empty', () => {
    const s = renderBar(0.5, 20, { unicode: true });
    expect([...s].filter(c => c === '█').length).toBe(10);
    expect(s).toHaveLength(20);
  });
  it('ratio=0 → all empty', () => {
    expect(renderBar(0, 10, { unicode: true })).toBe('▓'.repeat(10));
  });
  it('ratio=1 → all full', () => {
    expect(renderBar(1, 10, { unicode: true })).toBe('█'.repeat(10));
  });
  it('ascii fallback uses # and -', () => {
    const s = renderBar(0.5, 10, { unicode: false });
    expect(s).toBe('#####-----');
  });
  it('clamps ratio to [0,1]', () => {
    expect(renderBar(1.5, 4, { unicode: false })).toBe('####');
    expect(renderBar(-0.5, 4, { unicode: false })).toBe('----');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**.
- [ ] **Step 3: Implement** — `renderBar(ratio, width, { unicode })`: clamp ratio, compute `filled = Math.round(ratio * width)`, build string with fill char + empty char. Unicode: `█` full, `▓` empty (no partial eighths for v0.1; keep simple). ASCII: `#`/`-`. Returns plain string (no color).
- [ ] **Step 4: Run, expect PASS**.
- [ ] **Step 5: Commit** — `feat(render): renderBar with unicode + ascii fallback`.

### Task 5: Color thresholds

**Files:**
- Create: `src/render/color.ts`, `tests/render/color.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { colorize, THRESHOLD_DANGER, THRESHOLD_WARN } from '../../src/render/color.js';

describe('color thresholds', () => {
  it('constants', () => {
    expect(THRESHOLD_DANGER).toBe(0.90);
    expect(THRESHOLD_WARN).toBe(0.75);
  });
  it('useColor=false returns byte-identical string (no ANSI)', () => {
    const s = colorize(0.95, 'hello', false);
    expect(s).toBe('hello');
    // eslint-disable-next-line no-control-regex
    expect(s).not.toMatch(/\[/);
  });
  it('useColor=true + ratio>=0.9 wraps with red ANSI', () => {
    const s = colorize(0.95, 'hello', true);
    expect(s).toMatch(/\[3?1m.*hello.*\[39m/);
  });
  it('useColor=true + ratio>=0.75 but <0.9 wraps with yellow', () => {
    const s = colorize(0.80, 'hello', true);
    expect(s).toMatch(/\[33m.*hello.*\[39m/);
  });
  it('useColor=true + ratio<0.75 no wrapping', () => {
    expect(colorize(0.5, 'hello', true)).toBe('hello');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**.
- [ ] **Step 3: Implement** — import `picocolors`; `THRESHOLD_DANGER=0.90`, `THRESHOLD_WARN=0.75`; `colorize(ratio, str, useColor)`: if !useColor return str; if ratio >= DANGER return `pc.red(str)`; if >= WARN return `pc.yellow(str)`; else return str.
- [ ] **Step 4: Run, expect PASS**.
- [ ] **Step 5: Commit** — `feat(render): color thresholds + useColor=false byte invariant`.

### Task 6: Width helpers

**Files:**
- Create: `src/render/width.ts`, `tests/render/width.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { truncateMiddle, computeBarWidth } from '../../src/render/width.js';

describe('truncateMiddle', () => {
  it('returns input when <= maxCols', () => {
    expect(truncateMiddle('/a/b', 10)).toBe('/a/b');
  });
  it('elides middle with …', () => {
    const s = truncateMiddle('/Users/alice/projects/dleft', 15);
    expect(s.length).toBeLessThanOrEqual(15);
    expect(s).toContain('…');
    expect(s.startsWith('/Users')).toBe(true);
  });
  it('handles wide chars by display width', () => {
    // CJK char = display width 2
    expect(truncateMiddle('/한/글/path', 6)).toHaveProperty('length');
  });
});

describe('computeBarWidth', () => {
  it('clamps to [10,30]', () => {
    expect(computeBarWidth(40, 30)).toBe(10);  // 40-30=10
    expect(computeBarWidth(200, 30)).toBe(30); // 200-30=170, clamp 30
    expect(computeBarWidth(30, 30)).toBe(10);  // 30-30=0, clamp 10
  });
});
```

- [ ] **Step 2: Run, expect FAIL**.
- [ ] **Step 3: Implement** — `truncateMiddle` uses `string-width` for display-width calc; keeps first N chars, last M chars, inserts `…` between. `computeBarWidth(termCols, fixedBudget) = Math.max(10, Math.min(30, termCols - fixedBudget))`. `getTerminalWidth()` returns `process.stdout.columns ?? 80`.
- [ ] **Step 4: Run, expect PASS**.
- [ ] **Step 5: Commit** — `feat(render): width helpers (truncateMiddle, computeBarWidth)`.

### Phase C — Collectors

### Task 7: Commit fixtures

**Files:**
- Create: `tests/fixtures/darwin/diskutil-list.plist`, `tests/fixtures/darwin/diskutil-apfs-list.plist`, `tests/fixtures/darwin/df-kP.txt`, `tests/fixtures/linux/lsblk.json`, `tests/fixtures/linux/df-kPT.txt`.

- [ ] **Step 1: On a macOS host**, capture real output — `diskutil list -plist > tests/fixtures/darwin/diskutil-list.plist`, `diskutil apfs list -plist > tests/fixtures/darwin/diskutil-apfs-list.plist`, `df -kP > tests/fixtures/darwin/df-kP.txt`. Scrub volume names if private. If running during development on a non-macOS host, use the pre-made fixtures the user will supply (ask in plan review if unclear).
- [ ] **Step 2: On a Linux host** (or a VM/container), capture — `lsblk -J -b -o NAME,KNAME,SIZE,TYPE,MODEL,MOUNTPOINT,FSTYPE > tests/fixtures/linux/lsblk.json`, `df -kPT > tests/fixtures/linux/df-kPT.txt`.
- [ ] **Step 3: Verify** fixtures parse — `cat tests/fixtures/linux/lsblk.json | node -e 'JSON.parse(require("fs").readFileSync(0,"utf8"))'`, `plutil -lint tests/fixtures/darwin/*.plist` (macOS) or skip if not on macOS.
- [ ] **Step 4: Commit** — `test: capture darwin + linux fixtures for collector tests`.

### Task 8: FakeRunner helper

**Files:**
- Create: `tests/helpers/fake-runner.ts`, `tests/helpers/fake-runner.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { FakeRunner } from './fake-runner.js';

describe('FakeRunner', () => {
  it('returns fixture for matching cmd+args', async () => {
    const r = new FakeRunner({ 'echo hi there': 'hi there\n' });
    expect(await r.run('echo', ['hi', 'there'])).toBe('hi there\n');
  });
  it('throws descriptive error when key missing', async () => {
    const r = new FakeRunner({});
    await expect(r.run('df', ['-kP']))
      .rejects.toThrow(/FakeRunner: no fixture for 'df -kP'/);
  });
  it('simulates timeout when fixture is {timeout: true}', async () => {
    const r = new FakeRunner({ 'diskutil apfs list -plist': { timeout: true } });
    await expect(r.run('diskutil', ['apfs', 'list', '-plist']))
      .rejects.toThrow(/timeout/i);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**.
- [ ] **Step 3: Implement** — class `FakeRunner implements CommandRunner`, constructor takes `Record<string, string | { timeout: true }>`, key = `\`${cmd} ${args.join(' ')}\``. `run()` looks up key; throws descriptive error when missing; throws timeout-flavored error when value is `{timeout: true}`.
- [ ] **Step 4: Run, expect PASS**.
- [ ] **Step 5: Commit** — `test(helpers): FakeRunner with missing-key + timeout simulation`.

### Task 9: Linux collector

**Files:**
- Create: `src/collectors/linux.ts`, `tests/collectors/linux.test.ts`

- [ ] **Step 1: Write failing test** — load `tests/fixtures/linux/lsblk.json` + `df-kPT.txt` via `fs.readFileSync`; instantiate `FakeRunner` with the two fixture entries; call `collectLinux(fakeRunner)`; assert `DiskReport.platform === 'linux'`, `physicalDisks.length > 0` (depends on fixture — use ≥1), every `filesystems[i].sizeBytes > 0`, at least one entry has `isPseudo === true` (e.g. tmpfs), and warnings is an empty array for well-formed fixtures.

- [ ] **Step 2: Run, expect FAIL** (module not found).

- [ ] **Step 3: Implement** `src/collectors/linux.ts`:
  - `export async function collectLinux(runner: CommandRunner): Promise<DiskReport>`.
  - Run `lsblk -J -b -o NAME,KNAME,SIZE,TYPE,MODEL,MOUNTPOINT,FSTYPE` and `df -kPT` in parallel with `Promise.allSettled`.
  - Parse `lsblk` JSON; filter `type === 'disk'` for `physicalDisks`; walk children tree collecting `{part, lvm, crypt}` device paths.
  - Parse `df -kPT` rows (skip header; columns: Filesystem Type 1K-blocks Used Available Capacity Mounted); values × 1024 for bytes.
  - Join `df` rows to `lsblk` devices by device path → populate `physicalDiskId` (walk parents to `type='disk'`). If multiple parents or no traceable parent → `physicalDiskId = undefined` + push to `warnings`.
  - `isPseudo`: fstype in `{tmpfs, devfs, overlay, squashfs, autofs}` or starts with `fuse.gvfsd-`.
  - `physicalDisks[i].usedBytes` = Σ child filesystem `usedBytes` (Linux is safe — no APFS-style sharing).

- [ ] **Step 4: Run, expect PASS**.
- [ ] **Step 5: Add edge-case test** — pass `FakeRunner` where `df -kPT` times out; assert `filesystems: []`, `warnings` contains `/df.*timeout/i`, no throw. Run, expect PASS.
- [ ] **Step 6: Commit** — `feat(collectors): linux collector w/ lsblk+df, pseudo-fs filter, LVM mapping`.

### Task 10: Darwin collector

**Files:**
- Create: `src/collectors/darwin.ts`, `tests/collectors/darwin.test.ts`

- [ ] **Step 1: Write failing test** — load three darwin fixtures; `FakeRunner` with all three; call `collectDarwin(fakeRunner)`; assert:
  - One `PhysicalDisk` per APFS container (check count matches fixture's `Containers` array length).
  - For each APFS container disk, `usedBytes` equals `CapacityCeiling - FreeSpace` from the plist (NOT Σ volume.usedBytes — assert inequality against the naive sum to catch regressions).
  - `filesystems[i].physicalDiskId` resolves to the container disk id for every APFS volume.
  - `warnings` empty for well-formed fixtures.

- [ ] **Step 2: Run, expect FAIL**.

- [ ] **Step 3: Implement** `src/collectors/darwin.ts`:
  - Import `plist` from `plist` package.
  - Parallel: `diskutil list -plist`, `diskutil apfs list -plist`, `df -kP` via `Promise.allSettled`.
  - Parse `diskutil list` plist → `AllDisksAndPartitions` tree → seed `physicalDisks` from top-level disks (non-APFS).
  - Parse `diskutil apfs list` plist → for each `Containers[i]`: create a `PhysicalDisk` with `id=ContainerReference`, `usedBytes = CapacityCeiling - FreeSpace`, `freeBytes = FreeSpace`, `sizeBytes = CapacityCeiling`. If this plist errors or times out: push warning `'diskutil apfs list timed out; physical disk summary unavailable'`, do NOT fall back to inferring APFS containers from df. Continue rendering `filesystems` from df normally.
  - Parse `df -kP` rows (skip header; Filesystem 512-blocks … no wait — `-kP` is 1K-blocks POSIX format; columns: Filesystem 1024-blocks Used Available Capacity MountedOn); values × 1024.
  - Map each df mountpoint to physicalDiskId by matching device path against APFS volumes (container membership from `apfs list`) or against `diskutil list` partition map.
  - `isPseudo` for darwin: fstype starts with `devfs`, `map `, `mtmfs`, `autofs`, or device starts with `map `.

- [ ] **Step 4: Run, expect PASS**.
- [ ] **Step 5: Add timeout edge-case test** — `FakeRunner` returns `{timeout: true}` for `diskutil apfs list -plist`; assert `physicalDisks` is empty or only non-APFS entries; warnings has the APFS timeout message; `filesystems` populated from df; does NOT throw. Run, expect PASS.
- [ ] **Step 6: Commit** — `feat(collectors): darwin collector w/ APFS container reconciliation, timeout-safe`.

### Task 11: Platform dispatch + real runner

**Files:**
- Create: `src/collectors/index.ts`, `src/runner.ts`, `tests/collectors/index.test.ts`

- [ ] **Step 1: Write failing test** — `import { collect } from '../../src/collectors/index.js';` — call with a `FakeRunner` + `platform: 'darwin'` override → asserts dispatches to darwin collector (same report shape as Task 10). Call with `platform: 'win32'` → rejects with `Error('dleft: platform win32 is not supported (darwin and linux only)')`.

- [ ] **Step 2: Run, expect FAIL**.

- [ ] **Step 3: Implement `src/collectors/index.ts`**

```typescript
import type { CommandRunner, DiskReport } from '../model.js';
import { collectDarwin } from './darwin.js';
import { collectLinux } from './linux.js';

export async function collect(
  runner: CommandRunner,
  platform: NodeJS.Platform = process.platform,
): Promise<DiskReport> {
  if (platform === 'darwin') return collectDarwin(runner);
  if (platform === 'linux') return collectLinux(runner);
  throw new Error(`dleft: platform ${platform} is not supported (darwin and linux only)`);
}
```

- [ ] **Step 4: Implement `src/runner.ts`**

```typescript
import { execFile } from 'node:child_process';
import type { CommandRunner } from './model.js';

export const defaultRunner: CommandRunner = {
  run(cmd, args, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 5000;
    return new Promise((resolve, reject) => {
      execFile(cmd, [...args], { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout.toString());
      });
    });
  },
};
```

- [ ] **Step 5: Run, expect PASS**.
- [ ] **Step 6: Manual smoke** (non-CI) — `node -e "import('./src/runner.ts').then(...)"` via tsx or just skip; rely on the CLI smoke test in Task 15.
- [ ] **Step 7: Commit** — `feat(collectors): platform dispatch + execFile runner w/ 5s timeout`.

### Phase D — Render orchestration

### Task 12: Disks section

**Files:**
- Create: `src/render/disks.ts`, `tests/render/disks.test.ts`

- [ ] **Step 1: Write failing test** — construct a minimal `DiskReport` with 2 physical disks; call `renderDisks(report, opts)` with `opts.width=80`, `useColor=false`, `showBars=true`; use `expect(output).toMatchSnapshot()`. Second test: `showBars=false` → no bar column in output.

- [ ] **Step 2: Run, expect FAIL**.

- [ ] **Step 3: Implement** — header line `PHYSICAL DISKS`, then table with columns: ID, MODEL, SIZE, USED, FREE, USE%, [BAR]. Column widths hand-computed with `string-width` for display-width-safe `padEnd`/`padStart`. Use `pickColumnUnit` for SIZE/USED/FREE columns (consistent units). Use `colorize(ratio, cell, useColor)` on USE% and bar only when `useColor`. Bar column uses `computeBarWidth(width, fixed)` where `fixed` is sum of other columns' widths.

- [ ] **Step 4: Run, expect PASS** (snapshot committed on first run).
- [ ] **Step 5: Commit** — `feat(render): PHYSICAL DISKS section w/ column-consistent units`.

### Task 13: Filesystems section + sort

**Files:**
- Create: `src/render/filesystems.ts`, `tests/render/filesystems.test.ts`

- [ ] **Step 1: Write failing tests**
  - Snapshot default output (sort=size desc, `useColor=false`, `width=80`).
  - For each `sort` value in `['size', 'used', 'free', 'use%', 'name']` → snapshot.
  - `showAll=false` → snapshot does NOT contain `tmpfs` row; `showAll=true` → snapshot contains `tmpfs` row.
  - All snapshots use a fixed mock `DiskReport` defined at top of test file.

- [ ] **Step 2: Run, expect FAIL**.

- [ ] **Step 3: Implement** — `renderFilesystems(report, opts)`: filter out `isPseudo` unless `showAll`; sort by `opts.sort` (desc for numeric, asc for `name`; use% computed as `usedBytes/sizeBytes`); build table columns MOUNT, DEVICE, FSTYPE, SIZE, USED, FREE, USE%, [BAR]. Truncate mountpoint with `truncateMiddle(mp, mountMaxCol)` where mountMaxCol scales with width. Apply `colorize(use%, cell, useColor)` to the USE% cell and bar.

- [ ] **Step 4: Run, expect PASS** (snapshots committed).
- [ ] **Step 5: Commit** — `feat(render): FILESYSTEMS section w/ sort + pseudo filter`.

### Task 14: Render orchestrator

**Files:**
- Create: `src/render/index.ts`, `tests/render/index.test.ts`

- [ ] **Step 1: Write failing tests**
  - `opts.json=true` → output is valid JSON; `JSON.parse(output).schemaVersion === 1`; contains `physicalDisks`, `filesystems`, `warnings`.
  - `opts.only='disks'` → contains `PHYSICAL DISKS`, does NOT contain `FILESYSTEMS`.
  - `opts.only='fs'` → opposite.
  - Width responsiveness: for `width ∈ [40, 80, 120, 200]`, snapshot; manually verify no truncated bar column.
  - `useColor=false` → output contains no `[` escape sequences.

- [ ] **Step 2: Run, expect FAIL**.

- [ ] **Step 3: Implement** — `render(report, opts)`: if `opts.json` return `JSON.stringify(report, (k,v) => v instanceof Date ? v.toISOString() : v, 2)`. Else concatenate `opts.only`-filtered sections separated by `\n\n`. Append warnings footer: if `report.warnings.length > 0` append `\nWARNINGS:\n` + each prefixed with `  ! `.

- [ ] **Step 4: Run, expect PASS**.
- [ ] **Step 5: Commit** — `feat(render): orchestrator, --json, --only, warnings footer`.

### Phase E — CLI

### Task 15: CLI entry

**Files:**
- Create: `src/cli.ts`, `tests/cli.test.ts`

- [ ] **Step 1: Write failing test** for the testable helper — `resolveRenderOpts(argv: string[], env: Record<string, string | undefined>, isTTY: boolean): RenderOptions`:
  - `resolveRenderOpts(['--json'], {}, true).useColor === false` (JSON suppresses color).
  - `resolveRenderOpts([], {NO_COLOR: '1'}, true).useColor === false`.
  - `resolveRenderOpts([], {}, false).useColor === false` (no TTY → no color).
  - `resolveRenderOpts(['--si'], {}, true).base === 1000`.
  - `resolveRenderOpts(['-s', 'name'], {}, true).sort === 'name'`.
  - Invalid sort value → throws with message matching `/invalid sort/`.

- [ ] **Step 2: Run, expect FAIL**.

- [ ] **Step 3: Implement `src/cli.ts`**:
  - Export `resolveRenderOpts`, use `util.parseArgs({ options: { json: {type:'boolean', short:'j'}, all: {type:'boolean', short:'a'}, sort: {type:'string', short:'s'}, si: {type:'boolean'}, 'no-bars': {type:'boolean'}, 'no-color': {type:'boolean'}, only: {type:'string'}, help: {type:'boolean', short:'h'}, version: {type:'boolean', short:'V'} }, allowPositionals: false })`.
  - `useColor = !values['no-color'] && !env.NO_COLOR && isTTY && !values.json`.
  - Validate `sort` ∈ allowed set; validate `only` ∈ `{disks,fs}`; throw with message starting `dleft: invalid <flag>:` on failure.
  - `main()` function: `const opts = resolveRenderOpts(process.argv.slice(2), process.env, process.stdout.isTTY);` → if `--help` print usage + exit 0 → if `--version` print version + exit 0 → `const report = await collect(defaultRunner);` → `process.stdout.write(render(report, opts));` → if report.warnings print to stderr → exit 0. Top-level `main().catch(err => { process.stderr.write(\`dleft: \${err.message}\n\`); process.exit(err.code === 'INVALID_ARG' ? 2 : 1); })`.
  - Reach invalid-arg path: wrap `parseArgs` errors + validation throws with `(err as any).code = 'INVALID_ARG'`.

- [ ] **Step 4: Run, expect PASS**.
- [ ] **Step 5: Commit** — `feat(cli): argv parsing w/ util.parseArgs, color/env/TTY resolution`.

### Task 16: Exit codes + smoke test

**Files:**
- Modify: `src/cli.ts` (if needed after smoke test reveals bugs)
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Write `tests/smoke.test.ts`** — `beforeAll` runs `npm run build` (or `npx tsup`) once. Test: spawn `process.execPath` with `['dist/cli.js', '--help']`, assert exit code 0, stdout contains `Usage: dleft`. Test: spawn with `['dist/cli.js', '--sort', 'bogus']`, assert exit code 2, stderr contains `invalid sort`. Test: spawn with `['dist/cli.js', '--version']`, assert exit code 0, stdout matches semver.
- [ ] **Step 2: Run, expect FAIL** until `--help` output is wired.
- [ ] **Step 3: Implement `--help`/`--version`** in `src/cli.ts` — hand-rolled usage string (no external help generator); version from `package.json` via `import pkg from '../package.json' with { type: 'json' };` (Node 22 supports import attributes).
- [ ] **Step 4: Run, expect PASS**.
- [ ] **Step 5: Commit** — `feat(cli): --help + --version; smoke test w/ exit code matrix`.

### Phase F — Docs + CI

### Task 17: README + CHANGELOG

**Files:**
- Create: `README.md`, `CHANGELOG.md`

- [ ] **Step 1: Write `README.md`** — sections: one-line description, screenshot placeholder (`![dleft output](./docs/screenshot.svg)`), **Install** (`npm i -g dleft` + homebrew-tbd note), **Usage** (all flags in a table: flag / description / default), **Platform support** (macOS 10.15+ / Linux glibc; lists required commands), **JSON output** (note `schemaVersion: 1` contract), **Why not `df`?** (3-line rationale), **Development** (`npm install && npm test`), **License** (MIT).
- [ ] **Step 2: Write `CHANGELOG.md`** — Keep-a-Changelog format, `## [0.1.0] - 2026-04-TBD` with Added bullets (CLI, Darwin/Linux collectors, ASCII tables, bar graphs, `--json` v1, `--sort`, `--all`, `--no-color`, `--si`, `--only`).
- [ ] **Step 3: Commit** — `docs: README + CHANGELOG for v0.1.0`.

### Task 18: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request:
jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest]
        node: [22, 24]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ matrix.node }}, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - run: node dist/cli.js --version
```

- [ ] **Step 2: Push branch** and verify all 4 matrix cells pass on GitHub Actions. If a darwin-only or linux-only test fails on the wrong OS (e.g. Linux runner running darwin collector test), gate the test with `it.skipIf(process.platform !== 'darwin')` and re-commit.
- [ ] **Step 3: Commit** — `ci: test matrix Node 22/24 × ubuntu/macos + build smoke`.

### Phase G — Release

### Task 19: Release workflow + v0.1.0

**Files:**
- Create: `.github/workflows/release.yml`
- Modify: `package.json` (version bump if changed), `CHANGELOG.md` (fill date)

- [ ] **Step 1: Write `.github/workflows/release.yml`**

```yaml
name: Release
on:
  push:
    tags: ['v*']
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
      - run: npm ci
      - run: npm test
      - run: npm run build
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 2: Set `NPM_TOKEN` secret** on the GitHub repo (from npmjs.com → Automation token with Publish scope). Alternatively configure npm OIDC trusted publishing on npmjs.com to drop `NODE_AUTH_TOKEN` entirely; prefer OIDC if available.
- [ ] **Step 3: Update `CHANGELOG.md`** — replace `2026-04-TBD` with today's date.
- [ ] **Step 4: Tag + push** — `git tag v0.1.0 && git push origin v0.1.0`. Monitor Actions run; confirm provenance attestation appears on npm (`https://www.npmjs.com/package/dleft`).
- [ ] **Step 5: Post-publish verify** — on a clean host: `npx dleft@0.1.0 --version` → prints `0.1.0`; `npx dleft@0.1.0` → prints real report.
- [ ] **Step 6: Commit** — `ci: release workflow w/ OIDC provenance + --access public`.

---

## Verification

**Unit / integration (local):**
- `npm run typecheck` — no TS errors.
- `npm test` — all Vitest suites pass (model types, unit, bar, color, width, FakeRunner, linux collector, darwin collector, platform dispatch, disks render, filesystems render, render orchestrator, CLI resolveRenderOpts, smoke).
- `npm run build` — produces `dist/cli.js` with shebang.

**Smoke (local):**
- `node dist/cli.js --help` exits 0 with usage text.
- `node dist/cli.js --version` prints `0.1.0`.
- `node dist/cli.js` on the current host prints a real report with bars, sorted by size desc.
- `node dist/cli.js --json | jq .schemaVersion` prints `1`.
- `node dist/cli.js --no-color | cat -v` — no ANSI escapes in output.
- `node dist/cli.js --sort bogus` → exit 2, stderr `dleft: invalid sort: bogus`.
- `node dist/cli.js -a` shows pseudo-fs rows (tmpfs/devfs); default hides them.

**CI (GitHub Actions):**
- All 4 matrix cells (ubuntu/macos × Node 22/24) green on PR.

**Publish (once):**
- Tag `v0.1.0` triggers release workflow → npm shows 0.1.0 with provenance badge.
- `npx dleft@0.1.0` on a clean machine renders a report.

---

## Execution handoff

After approval of this plan:
1. Copy this file to `docs/superpowers/plans/2026-04-24-dleft-implementation.md`.
2. Choose execution mode:
   - **Subagent-driven (recommended)** — fresh subagent per task, review between tasks.
   - **Inline** — executing-plans skill, batch execution with checkpoints.
