import { LogEventId, Logger } from '@votingworks/logging';
import { execFile } from '../exec';
import { intermediateScript } from '../intermediate_scripts';

/**
 * Reboots the machine into the BIOS.
 */
export async function rebootToBios(logger: Logger): Promise<void> {
  await logger.logAsCurrentRole(LogEventId.RebootMachine, {
    message: 'User trigged a reboot of the machine to BIOS screen…',
  });

  void execFile('sudo', [intermediateScript('reboot-to-bios')]);
}
