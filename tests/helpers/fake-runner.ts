import type { CommandRunner } from '../../src/model.js';

export type FakeFixture = string | { timeout: true };

/**
 * CommandRunner implementation for tests. Looks up a fixture by key
 * `${cmd} ${args.join(' ')}` — this format is locked (changing it means
 * rewriting every collector test). A `{timeout: true}` value simulates a
 * timeout rejection with `code = 'ETIMEDOUT'` so collectors' timeout
 * handling branches can be exercised.
 */
export class FakeRunner implements CommandRunner {
  constructor(private readonly fixtures: Readonly<Record<string, FakeFixture>>) {}

  async run(cmd: string, args: readonly string[]): Promise<string> {
    const key = `${cmd} ${args.join(' ')}`;
    const value = this.fixtures[key];
    if (value === undefined) {
      const known = Object.keys(this.fixtures).map((k) => `  - ${k}`).join('\n');
      throw new Error(
        `FakeRunner: no fixture for '${key}'. Registered keys:\n${known || '  (none)'}`,
      );
    }
    if (typeof value === 'object' && 'timeout' in value) {
      const err: NodeJS.ErrnoException = new Error(`FakeRunner: ${key} timeout`);
      err.code = 'ETIMEDOUT';
      throw err;
    }
    return value;
  }
}
