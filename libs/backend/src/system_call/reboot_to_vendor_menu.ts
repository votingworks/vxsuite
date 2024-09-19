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

  void execFile('sudo', [intermediateScript('reboot-to-vendor-menu')]);
}
