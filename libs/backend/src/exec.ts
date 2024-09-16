// Isolate the system exec from the rest of the code to make it easier to test.
//
// If we don't do this, and we mock exec(), other parts of the code,
// notably related to sqlite3, can't be imported at all, because
// they use exec under the covers.

import * as cp from 'node:child_process';
import { promisify } from 'node:util';

/**
 * See `child_process.execFile` for details.
 */
export const execFile = promisify(cp.execFile);
