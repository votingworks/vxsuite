import { z } from 'zod/v4';
import {
  BallotStyleId,
  BallotStyleIdSchema,
  PrecinctId,
  PrecinctIdSchema,
} from '@votingworks/types';

/**
 * The payload encoded in a QR code (e.g. a VxPollbook check-in receipt) that
 * identifies which ballot style to activate. Carries the ballot style ID, which
 * is resolved against the loaded election definition. An optional precinct ID
 * disambiguates when the ballot style maps to more than one precinct in the
 * machine's configured polling place; when omitted, the precinct is derived
 * (used directly when there is only one).
 */
export interface BallotStyleQrCode {
  ballotStyleId: BallotStyleId;
  precinctId?: PrecinctId;
}

export const BallotStyleQrCodeSchema: z.ZodSchema<BallotStyleQrCode> = z.object(
  {
    ballotStyleId: BallotStyleIdSchema,
    precinctId: PrecinctIdSchema.optional(),
  }
);

/**
 * How a barcode scan should be handled when barcode activation is enabled:
 * - `voter_session`: start a cardless voter session for the scanned ballot style.
 * - `ballot_printing`: open the ballot printing screen preset to the scanned
 *   ballot style and language.
 */
export type BarcodeActivationMode = 'voter_session' | 'ballot_printing';

export const BarcodeActivationModeSchema: z.ZodSchema<BarcodeActivationMode> =
  z.union([z.literal('voter_session'), z.literal('ballot_printing')]);

export const DEFAULT_BARCODE_ACTIVATION_MODE: BarcodeActivationMode =
  'voter_session';

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
