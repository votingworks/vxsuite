import { z } from 'zod/v4';
import { PrecinctId, PrecinctSplitId } from './election';

/**
 * Registered voter counts for a precinct with splits, keyed by split ID.
 * Only splits with a count set are included.
 */
export interface PrecinctWithSplitsRegisteredVotersCounts {
  splits: Record<PrecinctSplitId, number>;
}

/**
 * Registered voters counts for a single precinct
 *
 * For precincts without splits, the value is the total count as a number.
 * For precincts with splits, the value is a record mapping split IDs to counts.
 */
export type PrecinctRegisteredVotersCountEntry =
  | number
  | PrecinctWithSplitsRegisteredVotersCounts;

/**
 * Registered voters counts for all precincts in an election, keyed by
 * PrecinctId. Only precincts or splits with a count set are included.
 */
export type ElectionRegisteredVotersCounts = Record<
  PrecinctId,
  PrecinctRegisteredVotersCountEntry
>;

export const PrecinctWithSplitsRegisteredVotersCountsSchema: z.ZodType<PrecinctWithSplitsRegisteredVotersCounts> =
  z.object({
    splits: z.record(z.string(), z.number().int().nonnegative()),
  });

export const PrecinctRegisteredVotersCountEntrySchema: z.ZodType<PrecinctRegisteredVotersCountEntry> =
  z.union([
    z.number().int().nonnegative(),
    PrecinctWithSplitsRegisteredVotersCountsSchema,
  ]);

export const ElectionRegisteredVotersCountsSchema: z.ZodType<ElectionRegisteredVotersCounts> =
  z.record(z.string(), PrecinctRegisteredVotersCountEntrySchema);
