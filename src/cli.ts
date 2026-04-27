import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import type { OnlySection, RenderOptions, SortField } from './model.js';
import { collect } from './collectors/index.js';
import { defaultRunner } from './runner.js';
import { render } from './render/index.js';
import { getTerminalWidth } from './render/width.js';

const VERSION = '0.1.6';

const USAGE = `Usage: dleft [options]

Render disk / partition / filesystem usage as ASCII tables + bar graphs.
Reads from diskutil + df (macOS) or lsblk + df (linux). Read-only.

Options:
  -j, --json           Emit JSON (schemaVersion: 1); suppresses color.
  -a, --all            Include pseudo-filesystems (tmpfs, overlay, etc.).
  -s, --sort <field>   Sort by size | used | free | use% | name (default: size).
      --si             Use SI units (KB, GB, TB) instead of IEC (KiB, GiB, TiB).
      --no-bars        Hide the bar column.
      --no-color       Disable ANSI color. Respects NO_COLOR env.
      --only <section> Render only 'disks' or 'fs'.
  -h, --help           Show this help.
  -V, --version        Print version.

Environment:
  NO_COLOR=1           Disable color.
  DLEFT_ASCII=1        Use ASCII-only bar chars (no unicode blocks).

Exit codes:
  0  Success (with or without warnings).
  1  Fatal error (platform unsupported, missing required command).
  2  Invalid argument.
`;

const VALID_SORTS: readonly SortField[] = [
  'size',
  'used',
  'free',
  'use%',
  'name',
];
const VALID_ONLY: readonly OnlySection[] = ['disks', 'fs'];

function invalidArg(message: string): NodeJS.ErrnoException {
  const err: NodeJS.ErrnoException = new Error(message);
  err.code = 'INVALID_ARG';
  return err;
}

export interface RenderOptsInput {
  columns?: number | undefined;
}

export function resolveRenderOpts(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  isTTY: boolean,
  input: RenderOptsInput = {},
): RenderOptions {
  let values: {
    json?: boolean;
    all?: boolean;
    sort?: string;
    si?: boolean;
    'no-bars'?: boolean;
    'no-color'?: boolean;
    only?: string;
    help?: boolean;
    version?: boolean;
  };
  try {
    const parsed = parseArgs({
      args: [...argv],
      options: {
        json: { type: 'boolean', short: 'j' },
        all: { type: 'boolean', short: 'a' },
        sort: { type: 'string', short: 's' },
        si: { type: 'boolean' },
        'no-bars': { type: 'boolean' },
        'no-color': { type: 'boolean' },
        only: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'V' },
      },
      allowPositionals: false,
      strict: true,
    });
    values = parsed.values;
  } catch (err) {
    throw invalidArg(`invalid argument: ${(err as Error).message}`);
  }

  const sort: SortField = (() => {
    if (values.sort === undefined) return 'size';
    if (VALID_SORTS.includes(values.sort as SortField)) {
      return values.sort as SortField;
    }
    throw invalidArg(
      `invalid sort: ${values.sort} (expected: ${VALID_SORTS.join(', ')})`,
    );
  })();

  const only: OnlySection | undefined = (() => {
    if (values.only === undefined) return undefined;
    if (VALID_ONLY.includes(values.only as OnlySection)) {
      return values.only as OnlySection;
    }
    throw invalidArg(
      `invalid only: ${values.only} (expected: ${VALID_ONLY.join(', ')})`,
    );
  })();

  const json = values.json === true;
  const useColor =
    !values['no-color'] && !env.NO_COLOR && isTTY && !json;
  const unicode = env.DLEFT_ASCII !== '1';
  const width = getTerminalWidth(input.columns);

  return {
    useColor,
    width,
    unicode,
    showBars: values['no-bars'] !== true,
    showAll: values.all === true,
    ...(only ? { only } : {}),
    sort,
    base: values.si === true ? 1000 : 1024,
    json,
  };
}

export function shouldShowHelp(argv: readonly string[]): boolean {
  return argv.includes('-h') || argv.includes('--help');
}

export function shouldShowVersion(argv: readonly string[]): boolean {
  return argv.includes('-V') || argv.includes('--version');
}

export function getUsageText(): string {
  return USAGE;
}

export function getVersion(): string {
  return VERSION;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (shouldShowHelp(argv)) {
    process.stdout.write(USAGE);
    return;
  }
  if (shouldShowVersion(argv)) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  const opts = resolveRenderOpts(argv, process.env, Boolean(process.stdout.isTTY), {
    columns: process.stdout.columns ?? undefined,
  });

  const report = await collect(defaultRunner);
  process.stdout.write(render(report, opts));
  process.stdout.write('\n');
  for (const w of report.warnings) {
    process.stderr.write(`dleft: warning: ${w}\n`);
  }
}

function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    // Resolve symlinks on argv[1]; Node's ESM loader already resolves them
    // when computing import.meta.url, so a raw pathToFileURL(argv[1]) on
    // a symlinked path (e.g. macOS /tmp → /private/tmp, or npm's .bin
    // shims) compares false against import.meta.url and main() never runs.
    const realEntry = realpathSync(entry);
    return import.meta.url === pathToFileURL(realEntry).href;
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main().catch((err: NodeJS.ErrnoException) => {
    process.stderr.write(`dleft: ${err.message}\n`);
    process.exit(err.code === 'INVALID_ARG' ? 2 : 1);
  });
}
