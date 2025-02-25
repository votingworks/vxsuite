import { assert, Optional } from '@votingworks/basics';
import {
  createPdiScannerClient,
  ScannerClient,
  ScannerEvent,
} from '@votingworks/pdi-scanner';

export interface SimpleScannerClient {
  connect(eventListener: (event: ScannerEvent) => void): Promise<void>;
  reconnect(): Promise<void>;
  disconnect(): Promise<void>;
  enableScanning(): Promise<void>;
  ejectAndRescanPaperIfPresent(): Promise<void>;
}

export function createSimpleScannerClient(): SimpleScannerClient {
  let client: Optional<ScannerClient>;
  let eventListener: Optional<(event: ScannerEvent) => void>;

  return {
    async connect(listener) {
      eventListener = listener;
      client = createPdiScannerClient();
      (await client.connect()).unsafeUnwrap();
      client.addListener(listener);
    },

    async reconnect() {
      assert(client && eventListener, 'Scanner client is not connected');

      (await client.disconnect()).unsafeUnwrap();
      client = createPdiScannerClient();
      (await client.connect()).unsafeUnwrap();
      client.addListener(eventListener);
    },

    async disconnect() {
      (await client?.disconnect())?.unsafeUnwrap();
      client = undefined;
    },

    async enableScanning() {
      assert(client, 'Scanner client is not connected');

      (await client.disableScanning()).unsafeUnwrap();
      (
        await client.enableScanning({
          doubleFeedDetectionEnabled: false,
          paperLengthInches: 11,
        })
      ).unsafeUnwrap();
    },

    async ejectAndRescanPaperIfPresent() {
      assert(client, 'Scanner client is not connected');

      const status = (await client.getScannerStatus()).unsafeUnwrap();

      if (status.rearLeftSensorCovered || status.rearRightSensorCovered) {
        (await client.ejectDocument('toFrontAndRescan')).unsafeUnwrap();
      }
    },
  };
}
