import {
  DEFAULT_SYSTEM_SETTINGS,
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
 * Whether the system settings allow the `ballot_printing` barcode activation
 * mode.
 */
export function isBarcodeBallotPrintingAllowed(
  systemSettings: SystemSettings = DEFAULT_SYSTEM_SETTINGS
): boolean {
  return Boolean(systemSettings.allowPrintingBlankBallotsFromVxMark);
}

/**
 * Resolves the barcode activation mode in effect, falling back to
 * `voter_session` when the system settings don't allow ballot printing.
 */
export function resolveBarcodeActivationMode(
  storedMode: BarcodeActivationMode,
  systemSettings?: SystemSettings
): BarcodeActivationMode {
  return isBarcodeBallotPrintingAllowed(systemSettings)
    ? storedMode
    : DEFAULT_BARCODE_ACTIVATION_MODE;
}
