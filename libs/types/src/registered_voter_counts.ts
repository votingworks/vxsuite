import { z } from 'zod/v4';
import { PrecinctId, PrecinctSplitId } from './election';

/**
 * Registered voter counts for a precinct with splits, keyed by split ID.
 * Only splits with a count set are included.
 */
export interface PrecinctWithSplitsRegisteredVoterCounts {
  splits: Record<PrecinctSplitId, number>;
}

/**
 * Registered voter counts for a single precinct
 *
 * For precincts without splits, the value is the total count as a number.
 * For precincts with splits, the value is a record mapping split IDs to counts.
 */
export type PrecinctRegisteredVoterCountEntry =
  | number
  | PrecinctWithSplitsRegisteredVoterCounts;

/**
 * Registered voter counts for all precincts in an election, keyed by
 * PrecinctId. Only precincts or splits with a count set are included.
 */
export type ElectionRegisteredVoterCounts = Record<
  PrecinctId,
  PrecinctRegisteredVoterCountEntry
>;

export const PrecinctWithSplitsRegisteredVoterCountsSchema: z.ZodType<PrecinctWithSplitsRegisteredVoterCounts> =
  z.object({
    splits: z.record(z.string(), z.number().int().nonnegative()),
  });

export const PrecinctRegisteredVoterCountEntrySchema: z.ZodType<PrecinctRegisteredVoterCountEntry> =
  z.union([
    z.number().int().nonnegative(),
    PrecinctWithSplitsRegisteredVoterCountsSchema,
  ]);

export const ElectionRegisteredVoterCountsSchema: z.ZodType<ElectionRegisteredVoterCounts> =
  z.record(z.string(), PrecinctRegisteredVoterCountEntrySchema);
