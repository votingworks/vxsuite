import { assert, Optional } from '@votingworks/basics';
import {
  createPdiScannerClient,
  EjectMotion,
  ScannerClient,
  ScannerEvent,
} from '@votingworks/pdi-scanner';

export interface SimpleScannerClient {
  isConnected(): boolean;
  connect(eventListener: (event: ScannerEvent) => void): Promise<void>;
  disconnect(): Promise<void>;
  enableScanning(): Promise<void>;
  disableScanning(): Promise<void>;
  ejectAndRescanPaperIfPresent(): Promise<void>;
  ejectPaper(ejectMotion: EjectMotion): Promise<void>;
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
      (await client.exit()).unsafeUnwrap();
      client = undefined;
    },

    async enableScanning() {
      assert(client, 'Scanner client is not connected');

      (await client.disableScanning()).unsafeUnwrap();
      (
        await client.enableScanning({
          doubleFeedDetectionEnabled: false,
          paperLengthInches: 22,
        })
      ).unsafeUnwrap();
    },

    async disableScanning() {
      assert(client, 'Scanner client is not connected');

      (await client.disableScanning()).unsafeUnwrap();
    },

    async ejectAndRescanPaperIfPresent() {
      assert(client, 'Scanner client is not connected');

      const status = (await client.getScannerStatus()).unsafeUnwrap();

      if (status.rearLeftSensorCovered || status.rearRightSensorCovered) {
        (await client.ejectDocument('toFrontAndRescan')).unsafeUnwrap();
      }
    },

    async ejectPaper(ejectMotion: EjectMotion) {
      assert(client, 'Scanner client is not connected');

      const status = (await client.getScannerStatus()).unsafeUnwrap();

      if (status.rearLeftSensorCovered || status.rearRightSensorCovered) {
        (await client.ejectDocument(ejectMotion)).unsafeUnwrap();
      }
    },
  };
}
