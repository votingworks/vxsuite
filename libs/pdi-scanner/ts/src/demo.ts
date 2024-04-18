import { sleep } from '@votingworks/basics';
import { createPdiScannerClient } from './scanner_client';

// eslint-disable-next-line vx/gts-jsdoc
export async function main(): Promise<void> {
  const scannerClient = createPdiScannerClient();
  (await scannerClient.connect()).unsafeUnwrap();

  let status = (await scannerClient.getScannerStatus()).unsafeUnwrap();
  if (status.documentInScanner) {
    (await scannerClient.enableScanning()).unsafeUnwrap();
    (await scannerClient.ejectDocument('toRear')).unsafeUnwrap();
    (await scannerClient.disableScanning()).unsafeUnwrap();
  }
  status = (await scannerClient.getScannerStatus()).unsafeUnwrap();
  if (!status.scannerEnabled) {
    (await scannerClient.enableScanning()).unsafeUnwrap();
  }

  for (;;) {
    await sleep(1000);
  }
}
