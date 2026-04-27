import { describe, it, expect, beforeAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const execFileAsync = promisify(execFile);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distCli = resolve(repoRoot, 'dist/cli.js');

async function runCli(
  args: readonly string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      distCli,
      ...args,
    ]);
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number | string;
    };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      code: typeof e.code === 'number' ? e.code : 1,
    };
  }
}

describe('smoke — built dist/cli.js', () => {
  beforeAll(async () => {
    if (!existsSync(distCli)) {
      // Build once if dist is missing; skip if present to keep the suite fast.
      await execFileAsync('npx', ['tsup'], { cwd: repoRoot });
    }
  }, 60_000);

  it('--help exits 0 and prints usage', async () => {
    const { stdout, code } = await runCli(['--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('Usage: dleft');
  });

  it('--version exits 0 and prints semver', async () => {
    const { stdout, code } = await runCli(['--version']);
    expect(code).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('--sort bogus exits 2 with stderr message', async () => {
    const { stderr, code } = await runCli(['--sort', 'bogus']);
    expect(code).toBe(2);
    expect(stderr).toMatch(/dleft: .*invalid sort/i);
  });

  it('unknown flag exits 2', async () => {
    const { code } = await runCli(['--nonsense']);
    expect(code).toBe(2);
  });

  it('default run exits 0 with output (on supported platform)', async () => {
    const { stdout, stderr, code } = await runCli([]);
    // platform gated: if darwin or linux, expect success + output.
    if (process.platform === 'darwin' || process.platform === 'linux') {
      expect(code).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
    } else {
      expect(code).toBe(1);
      expect(stderr).toMatch(/not supported/);
    }
  });

  it('--json output is valid JSON with schemaVersion=1 (on supported platform)', async () => {
    if (process.platform !== 'darwin' && process.platform !== 'linux') return;
    const { stdout, code } = await runCli(['--json']);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.schemaVersion).toBe(1);
  });

  it('--no-color output contains no ANSI escapes', async () => {
    if (process.platform !== 'darwin' && process.platform !== 'linux') return;
    const { stdout, code } = await runCli(['--no-color']);
    expect(code).toBe(0);
    expect(stdout.includes('\x1b[')).toBe(false);
  });

  it('runs via symlink (regression: macOS /tmp → /private/tmp + npm .bin shims)', async () => {
    // Without realpathSync in isEntryPoint, an invocation path that resolves
    // through a symlink mismatches import.meta.url (Node ESM resolves
    // symlinks; pathToFileURL doesn't), so main() never runs and --version
    // exits 0 with no output. This test catches that regression.
    const { mkdtempSync, symlinkSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const symlinkDir = mkdtempSync(resolve(tmpdir(), 'dleft-symlink-'));
    const linkPath = resolve(symlinkDir, 'cli.js');
    try {
      symlinkSync(distCli, linkPath);
      const { stdout, code } = await new Promise<{ stdout: string; code: number }>(
        (resolveOnce) => {
          execFile(process.execPath, [linkPath, '--version'], (err, out) => {
            if (err) {
              const e = err as NodeJS.ErrnoException & { code?: number | string };
              resolveOnce({
                stdout: typeof out === 'string' ? out : '',
                code: typeof e.code === 'number' ? e.code : 1,
              });
            } else {
              resolveOnce({ stdout: out, code: 0 });
            }
          });
        },
      );
      expect(code).toBe(0);
      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    } finally {
      rmSync(symlinkDir, { recursive: true, force: true });
    }
  });
});
