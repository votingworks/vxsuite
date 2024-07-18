import { execFile } from '../exec';
import { intermediateScript } from '../intermediate_scripts';

/**
 * Reboots the machine.
 */
export function reboot(): void {
  void execFile('sudo', [intermediateScript('reboot')]);
}
