import { LogEventId, Logger } from '@votingworks/logging';
import { execFile } from '../exec.js';
import { intermediateScript } from '../intermediate_scripts.js';

/**
 * Reboots the machine.
 */
export async function reboot(logger: Logger): Promise<void> {
  await logger.logAsCurrentRole(LogEventId.RebootMachine, {
    message: 'User rebooted the machine.',
  });

  void execFile('sudo', [intermediateScript('reboot')]);
}
