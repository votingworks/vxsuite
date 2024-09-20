import path from 'node:path';
import { LogEventId, Logger } from '@votingworks/logging';

import { execFile } from '../exec';
import { intermediateScript } from '../intermediate_scripts';

/**
 * Reboots the machine into the vendor menu.
 */
export async function rebootToVendorMenu(logger: Logger): Promise<void> {
  await logger.logAsCurrentRole(LogEventId.RebootMachine, {
    message: 'Vendor rebooted the machine into the vendor menu.',
  });

  // Not all env vars are propagated when using sudo, so we access the VX_CONFIG_ROOT env var here
  // rather than in the script itself
  const appFlagsLocation = process.env.VX_CONFIG_ROOT
    ? path.join(process.env.VX_CONFIG_ROOT, 'app-flags')
    : '/tmp'; // VX_CONFIG_ROOT is not defined in dev

  void execFile('sudo', [
    intermediateScript('reboot-to-vendor-menu'),
    appFlagsLocation,
  ]);
}
