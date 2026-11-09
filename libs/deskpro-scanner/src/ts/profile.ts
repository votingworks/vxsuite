import { join } from 'node:path';
import { PACKAGE_ROOT } from './package_root.js';

/** The profile the backend loads: 200 dpi gray, with errors reported to the host (`ifError = 0`). */
export const VX_PROFILE_PATH = join(PACKAGE_ROOT, 'profiles/vx-gray200.ino');
