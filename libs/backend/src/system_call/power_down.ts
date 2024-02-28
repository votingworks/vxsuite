import { LogEventId, Logger } from '@votingworks/logging';
import { execFile } from '../exec';

/**
 * Reboots the machine.
 */
export async function powerDown(logger: Logger): Promise<void> {
  await logger.logAsCurrentUser(LogEventId.PowerDown, {
    message: 'User triggered the machine to power down.',
  });

  // -i prevents blocking the reboot on other logged in users
  void execFile('systemctl', ['poweroff', '-i']);
}
