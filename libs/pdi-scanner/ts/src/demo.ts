import { sleep } from '@votingworks/basics';
import { ScannerClient, createPdiScannerClient } from './scanner_client';

let scannerClient: ScannerClient;
let interrupted = false;

process.on('SIGINT', () => {
  interrupted = true;
});

// eslint-disable-next-line vx/gts-jsdoc
export async function main(): Promise<void> {
  scannerClient = createPdiScannerClient();
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

  while (!interrupted) {
    await sleep(1000);
  }

  (await scannerClient.exit()).unsafeUnwrap();
}
