import { err } from '@votingworks/basics';
import { isDeviceAttached } from '@votingworks/backend';
import type { BatchControl, BatchScanner } from './batch_scanner.js';

export const INOTEC_VENDOR_ID = 0x2bcc;
export const INOTEC_DESKPRO_PRODUCT_ID = 0x0001;

/** A {@link BatchScanner} for the InoTec SCAMAX DeskPro; scanning is not yet supported. */
export class DeskProBatchScanner implements BatchScanner {
  isAttached(): boolean {
    return isDeviceAttached(
      ({ deviceDescriptor }) =>
        deviceDescriptor.idVendor === INOTEC_VENDOR_ID &&
        deviceDescriptor.idProduct === INOTEC_DESKPRO_PRODUCT_ID
    );
  }

  isImprinterDetected(): Promise<boolean> {
    return Promise.resolve(false);
  }

  startBatch(): BatchControl {
    return {
      scanSheet: () =>
        Promise.resolve(
          err({
            code: 'scan_failed',
            message: 'Scanning with the DeskPro is not yet supported',
          })
        ),
      endBatch: () => Promise.resolve(),
    };
  }
}
