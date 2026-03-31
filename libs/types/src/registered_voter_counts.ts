import { z } from 'zod/v4';
import { hasSplits, Precinct, PrecinctId, PrecinctSplitId } from './election';

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

export function isPrecinctCount(
  entry: PrecinctRegisteredVotersCountEntry
): entry is number {
  return typeof entry === 'number';
}

export function isSplitCounts(
  entry: PrecinctRegisteredVotersCountEntry
): entry is PrecinctWithSplitsRegisteredVotersCounts {
  return typeof entry === 'object';
}

export function hasPartialRegisteredVoterCounts(
  precincts: readonly Precinct[],
  counts: ElectionRegisteredVotersCounts
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
