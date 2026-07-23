import { z } from 'zod/v4';
import { BallotStyleId, BallotStyleIdSchema } from '@votingworks/types';

/**
 * The payload encoded in a QR code (e.g. a VxPollbook check-in receipt) that
 * identifies which ballot style to activate. Intentionally minimal — it carries
 * only the ballot style ID, which is resolved against the loaded election
 * definition.
 */
export interface BallotStyleQrCode {
  ballotStyleId: BallotStyleId;
}

export const BallotStyleQrCodeSchema: z.ZodSchema<BallotStyleQrCode> = z.object(
  {
    ballotStyleId: BallotStyleIdSchema,
  }
);

export interface ScanEvent {
  type: 'scan';
  data: Uint8Array;
}

export interface StatusMessage {
  type: 'status';
  connected: boolean;
}

export type WorkerMessage = ScanEvent | StatusMessage;

export interface BarcodeReaderEvents {
  scan: [Uint8Array];
  error: [Error];
}

export interface BarcodeReader {
  getConnectionStatus(): boolean;
  on<K extends keyof BarcodeReaderEvents>(
    event: K,
    listener: (...args: BarcodeReaderEvents[K]) => void
  ): this;
  shutDown(): Promise<number>;
}
