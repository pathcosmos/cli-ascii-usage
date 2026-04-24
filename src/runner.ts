import { execFile } from 'node:child_process';
import type { CommandRunner } from './model.js';

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_BUFFER = 16 * 1024 * 1024;

/**
 * Production CommandRunner: wraps node's execFile with a 5-second default
 * timeout and a 16 MiB output buffer. Uses an argv array (no shell), so
 * neither `cmd` nor `args` is ever passed through a shell — arg-injection is
 * impossible by construction.
 */
export const defaultRunner: CommandRunner = {
  run(cmd, args, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      execFile(
        cmd,
        [...args],
        { timeout: timeoutMs, maxBuffer: MAX_BUFFER, windowsHide: true },
        (err, stdout) => {
          if (err) return reject(err);
          resolve(String(stdout));
        },
      );
    });
  },
};
