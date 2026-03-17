import { z } from 'zod/v4';
import { PrecinctId, PrecinctSplitId } from './election';

export interface PrecinctSplitMetadata {
  registeredVoterCount?: number;
}

/**
 * Per-precinct metadata that lives outside the election definition (and
 * therefore outside the ballot hash). For precincts without splits,
 * `registeredVoterCount` is set directly on the entry. For precincts with
 * splits, each split's count is keyed by PrecinctSplitId under `splits`.
 */
export interface PrecinctMetadataEntry {
  registeredVoterCount?: number;
  splits?: Record<PrecinctSplitId, PrecinctSplitMetadata>;
}

/**
 * Registered voter counts for all precincts/splits in an election, keyed by
 * PrecinctId. Conveyed through the election package as a separate file so that
 * updating voter counts does not invalidate the ballot hash.
 */
export type ElectionPrecinctMetadata = Record<
  PrecinctId,
  PrecinctMetadataEntry
>;

const PrecinctSplitMetadataSchema: z.ZodType<PrecinctSplitMetadata> = z.object({
  registeredVoterCount: z.number().int().nonnegative().optional(),
});

const PrecinctMetadataEntrySchema: z.ZodType<PrecinctMetadataEntry> = z.object({
  registeredVoterCount: z.number().int().nonnegative().optional(),
  splits: z.record(z.string(), PrecinctSplitMetadataSchema).optional(),
});

export const ElectionPrecinctMetadataSchema: z.ZodType<ElectionPrecinctMetadata> =
  z.record(z.string(), PrecinctMetadataEntrySchema);
