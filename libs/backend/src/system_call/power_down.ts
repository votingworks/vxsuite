import { LogEventId, Logger } from '@votingworks/logging';
import { execFile } from '../exec.js';
import { intermediateScript } from '../intermediate_scripts.js';

/**
 * Powers down the machine.
 */
export async function powerDown(logger: Logger): Promise<void> {
  await logger.logAsCurrentRole(LogEventId.PowerDown, {
    message: 'User powered down the machine.',
  });

  void execFile('sudo', [intermediateScript('power-down')]);
}
