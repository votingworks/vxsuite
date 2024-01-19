import { execFile } from '../exec';

/**
 * Reboots the machine.
 */
export function powerDown(): void {
  // -i prevents blocking the reboot on other logged in users
  void execFile('systemctl', ['poweroff', '-i']);
}
