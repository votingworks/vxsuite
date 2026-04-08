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
  ejectAndRescanPaperIfPresent(): Promise<boolean>;
  ejectPaper(ejectMotion: EjectMotion): Promise<boolean>;
  isFrontSensorCovered(): Promise<boolean>;
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

    /**
     * Ejects paper and rescans it if paper is present. Returns true if paper
     * was present, false otherwise.
     */
    async ejectAndRescanPaperIfPresent() {
      assert(client, 'Scanner client is not connected');

      const status = (await client.getScannerStatus()).unsafeUnwrap();

      if (status.rearLeftSensorCovered || status.rearRightSensorCovered) {
        (await client.ejectDocument('toFrontAndRescan')).unsafeUnwrap();
        return true;
      }
      return false;
    },

    /**
     * Ejects paper according to `ejectMotion` if paper is present. Returns true
     * if paper was present, false otherwise.
     */
    async ejectPaper(ejectMotion: EjectMotion) {
      assert(client, 'Scanner client is not connected');

      const status = (await client.getScannerStatus()).unsafeUnwrap();

      if (status.rearLeftSensorCovered || status.rearRightSensorCovered) {
        (await client.ejectDocument(ejectMotion)).unsafeUnwrap();
        return true;
      }
      return false;
    },

    async isFrontSensorCovered() {
      assert(client, 'Scanner client is not connected');

      const status = (await client.getScannerStatus()).unsafeUnwrap();

      return (
        status.frontLeftSensorCovered ||
        status.frontM1SensorCovered ||
        status.frontM2SensorCovered ||
        status.frontM3SensorCovered ||
        status.frontM4SensorCovered
      );
    },
  };
}
