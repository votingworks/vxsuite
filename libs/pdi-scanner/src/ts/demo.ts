import { sleep } from '@votingworks/basics';
import { createPdiScannerClient } from './scanner_client';

/**
 * A simple demo that continuously scans ballots.
 */
export async function main(): Promise<void> {
  const scannerClient = createPdiScannerClient();
  (await scannerClient.connect()).unsafeUnwrap();

  const scanningOptions = {
    doubleFeedDetectionEnabled: true,
    paperLengthInches: 11,
  } as const;

  (await scannerClient.enableScanning(scanningOptions)).unsafeUnwrap();

  let state = 'waitingForBallot';
  scannerClient.addListener((event) => {
    switch (event.event) {
      case 'scanStart':
        state = 'scanning';
        break;
      case 'scanComplete':
        state = 'scanComplete';
        break;
      default:
        break;
    }
  });

  for (;;) {
    if (state === 'scanComplete') {
      (await scannerClient.ejectDocument('toRear')).unsafeUnwrap();
      (await scannerClient.enableScanning(scanningOptions)).unsafeUnwrap();
      state = 'waitingForBallot';
    }
    await sleep(1000);
  }
}
