import type { PrinterStatus } from '@votingworks/scan-backend';

export function isPrinterReadyHelper(status: PrinterStatus): boolean {
  if (status.scheme === 'hardware-v3') {
    return status.connected;
  }

  return status.state === 'idle';
}
