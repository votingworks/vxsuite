import { LogEventId, Logger } from '@votingworks/logging';
import { execFile } from '../exec';
import { intermediateScript } from '../intermediate_scripts';

/**
 * Reboots the machine.
 */
export async function reboot(logger: Logger): Promise<void> {
  await logger.logAsCurrentRole(LogEventId.PowerDown, {
    message: 'Reboot triggered by card insertion.',
  });

  void execFile('sudo', [intermediateScript('reboot')]);
}
