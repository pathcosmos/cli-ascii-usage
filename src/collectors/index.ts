import type { CommandRunner, DiskReport } from '../model.js';
import { collectDarwin } from './darwin.js';
import { collectLinux } from './linux.js';

/**
 * Dispatch to the platform-specific collector. Accepts an explicit `platform`
 * for tests; defaults to `process.platform` at runtime.
 */
export async function collect(
  runner: CommandRunner,
  platform: NodeJS.Platform = process.platform,
): Promise<DiskReport> {
  if (platform === 'darwin') return collectDarwin(runner);
  if (platform === 'linux') return collectLinux(runner);
  throw new Error(
    `dleft: platform ${platform} is not supported (darwin and linux only)`,
  );
}
