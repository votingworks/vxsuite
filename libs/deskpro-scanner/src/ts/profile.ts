import { join } from 'node:path';
import { assertDefined } from '@votingworks/basics';

/** The profile the backend loads: 200 dpi gray, with errors reported to the host (`ifError = 0`). */
export const VX_PROFILE_PATH = join(
  assertDefined(import.meta.dirname.split('libs')[0]),
  'libs/deskpro-scanner/profiles/vx-gray200.ino'
);
