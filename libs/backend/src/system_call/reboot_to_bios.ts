import { execFile } from '../exec';

/**
 * Reboots the machine into the BIOS.
 */
export function rebootToBios(): void {
  // -i prevents blocking the reboot on other logged in users
  void execFile('systemctl', ['reboot', '--firmware-setup', '-i']);
}
