import { assert, Optional } from '@votingworks/basics';
import {
  createPdiScannerClient,
  ScannerClient,
  ScannerEvent,
} from '@votingworks/pdi-scanner';

export interface SimpleScannerClient {
  isConnected(): boolean;
  connect(eventListener: (event: ScannerEvent) => void): Promise<void>;
  disconnect(): Promise<void>;
  enableScanning(): Promise<void>;
  ejectAndRescanPaperIfPresent(): Promise<void>;
}

export function createSimpleScannerClient(): SimpleScannerClient {
  let client: Optional<ScannerClient>;

  return {
    isConnected() {
      return client !== undefined;
    },

    async connect(listener) {
      assert(client === undefined, 'Scanner client is already connected');
      client = createPdiScannerClient();
      (await client.connect()).unsafeUnwrap();
      client.addListener(listener);
    },

    async disconnect() {
      assert(client, 'Scanner client is not connected');
      (await client.disconnect()).unsafeUnwrap();
      client = undefined;
    },

    async enableScanning() {
      assert(client, 'Scanner client is not connected');

      (await client.disableScanning()).unsafeUnwrap();
      (
        await client.enableScanning({
          bitonalThreshold: 75,
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
