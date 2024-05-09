import fs from 'fs/promises';
import path from 'path';
import { assertDefined } from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';

import { execFile } from '../exec';

/**
 * Reboots the machine into the vendor menu.
 */
export async function rebootToVendorMenu(logger: Logger): Promise<void> {
  await logger.logAsCurrentRole(LogEventId.RebootMachine, {
    message: 'User trigged a reboot of the machine into the vendor menu.',
  });

  const vxConfigRoot =
    process.env.NODE_ENV === 'production'
      ? assertDefined(process.env.VX_CONFIG_ROOT)
      : '/tmp';
  await fs.writeFile(
    path.join(vxConfigRoot, 'RUN_VENDOR_MENU_ON_NEXT_BOOT'),
    '1\n'
  );

  // -i prevents blocking the reboot on other logged in users
  void execFile('systemctl', ['reboot', '-i']);
}
