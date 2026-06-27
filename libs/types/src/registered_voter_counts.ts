import { z } from 'zod/v4';
import { hasSplits, Precinct, PrecinctId, PrecinctSplitId } from './election';

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

export function isPrecinctCount(
  entry: PrecinctRegisteredVoterCountEntry
): entry is number {
  return typeof entry === 'number';
}

export function isSplitCounts(
  entry: PrecinctRegisteredVoterCountEntry
): entry is PrecinctWithSplitsRegisteredVoterCounts {
  return typeof entry === 'object';
}

export function hasPartialRegisteredVoterCounts(
  precincts: readonly Precinct[],
  counts: ElectionRegisteredVoterCounts
): boolean {
  let someHaveCount = false;
  let someMissingCount = false;

  for (const precinct of precincts) {
    if (hasSplits(precinct)) {
      const precinctEntry = counts[precinct.id];
      for (const split of precinct.splits) {
        if (
          precinctEntry !== undefined &&
          isSplitCounts(precinctEntry) &&
          precinctEntry.splits[split.id] !== undefined
        ) {
          someHaveCount = true;
        } else {
          someMissingCount = true;
        }
      }
    } else if (
      counts[precinct.id] !== undefined &&
      isPrecinctCount(counts[precinct.id])
    ) {
      someHaveCount = true;
    } else {
      someMissingCount = true;
    }
  }

  return someHaveCount && someMissingCount;
}

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
