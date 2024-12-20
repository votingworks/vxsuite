import { LogEventId, Logger } from '@votingworks/logging';
import { execFile } from '../exec';
import { intermediateScript } from '../intermediate_scripts';

/**
 * Powers down the machine.
 */
export async function powerDown(logger: Logger): Promise<void> {
  await logger.logAsCurrentRole(LogEventId.PowerDown, {
    message: 'User powered down the machine.',
  });

  void execFile('sudo', [intermediateScript('power-down')]);
}
