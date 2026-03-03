/* istanbul ignore file */
/**
 * Small module to make it easier to mock execFile.
 */

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

export const exec = promisify(execFile);
export { spawn };
