import { LogEventId, Logger } from '@votingworks/logging';
import { execFile } from '../exec';
import { intermediateScript } from '../intermediate_scripts';

/**
 * Reboots the machine.
 */
export async function powerDown(logger: Logger): Promise<void> {
  await logger.logAsCurrentRole(LogEventId.PowerDown, {
    message: 'User triggered the machine to power down.',
  });

  // -i prevents blocking the reboot on other logged in users
  void execFile('sudo', [intermediateScript('power-down')]);
}
