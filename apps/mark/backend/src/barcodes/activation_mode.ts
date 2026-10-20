import {
  type BallotStyleId,
  DEFAULT_SYSTEM_SETTINGS,
  type PrecinctId,
  type SystemSettings,
} from '@votingworks/types';
import { z } from 'zod/v4';

/**
 * How VxMark handles a scanned ballot style barcode:
 * - `voter_session`: starts a voter session for the scanned ballot style.
 * - `ballot_printing`: prints a ballot for the scanned ballot style.
 */
export type BarcodeActivationMode = 'voter_session' | 'ballot_printing';

export const BarcodeActivationModeSchema: z.ZodSchema<BarcodeActivationMode> =
  z.enum(['voter_session', 'ballot_printing']);

export const DEFAULT_BARCODE_ACTIVATION_MODE: BarcodeActivationMode =
  'voter_session';

/**
 * Whether system settings allow `ballot_printing` barcode activation mode.
 */
export function isBarcodeBallotPrintingAllowed(
  systemSettings: SystemSettings = DEFAULT_SYSTEM_SETTINGS
): boolean {
  return !!systemSettings.allowPrintingBlankBallotsFromVxMark;
}

/**
 * A ballot to print, from a ballot style barcode scanned in `ballot_printing`
 * mode.
 */
export interface BarcodePrintRequest {
  readonly ballotStyleId: BallotStyleId;
  readonly precinctId: PrecinctId;
}
