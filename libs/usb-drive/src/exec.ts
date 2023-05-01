/* istanbul ignore file */
/**
 * Small module to make it easier to mock execFile.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

export const exec = promisify(execFile);
