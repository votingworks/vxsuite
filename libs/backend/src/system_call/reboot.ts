import { LogEventId, type Logger } from '@votingworks/logging';
import { execFile } from '../exec.js';
import { getNodeEnv } from '../globals.js';
import { intermediateScript } from '../intermediate_scripts.js';

/**
 * Reboots the machine.
 */
export async function reboot(logger: Logger): Promise<void> {
  await logger.logAsCurrentRole(LogEventId.RebootMachine, {
    message: 'User rebooted the machine.',
  });

  if (getNodeEnv() === 'development') {
    process.exit(0);
  }

  void execFile('sudo', [intermediateScript('reboot')]);
}
