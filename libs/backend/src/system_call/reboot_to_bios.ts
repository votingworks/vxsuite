import { LogEventId, Logger } from '@votingworks/logging';
import { execFile } from '../exec';

/**
 * Reboots the machine into the BIOS.
 */
export async function rebootToBios(logger: Logger): Promise<void> {
  await logger.logAsCurrentRole(LogEventId.RebootMachine, {
    message: 'User trigged a reboot of the machine to BIOS screen…',
  });

  // -i prevents blocking the reboot on other logged in users
  void execFile('systemctl', ['reboot', '--firmware-setup', '-i']);
}
