import { z } from 'zod/v4';
import {
  hasSplits,
  type Precinct,
  type PrecinctId,
  type PrecinctSplitId,
} from './election.js';

/**
 * Registered voter count for a precinct or split.
 */
export interface RegisteredVoterCount {
  readonly total: number;
}

/**
 * Registered voter counts for a precinct with splits, keyed by split ID.
 * Only splits with a count set are included.
 */
export interface PrecinctWithSplitsRegisteredVoterCounts {
  splits: Record<PrecinctSplitId, RegisteredVoterCount>;
}

/**
 * Registered voter counts for a single precinct
 *
 * For precincts without splits, the value is the precinct's count.
 * For precincts with splits, the value is a record mapping split IDs to counts.
 */
export type PrecinctRegisteredVoterCountEntry =
  | RegisteredVoterCount
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
): entry is RegisteredVoterCount {
  return !('splits' in entry);
}

export function isSplitCounts(
  entry: PrecinctRegisteredVoterCountEntry
): entry is PrecinctWithSplitsRegisteredVoterCounts {
  return 'splits' in entry;
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
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      isPrecinctCount(counts[precinct.id]!)
    ) {
      someHaveCount = true;
    } else {
      someMissingCount = true;
    }
  }

  return someHaveCount && someMissingCount;
}

const CountSchema = z.number().int().nonnegative();

const RegisteredVoterCountObjectSchema: z.ZodType<RegisteredVoterCount> =
  z.strictObject({ total: CountSchema });

/**
 * Accepts a plain number as a total, for packages exported before counts
 * could be broken out by party.
 */
export const RegisteredVoterCountSchema: z.ZodType<RegisteredVoterCount> =
  z.union([
    CountSchema.transform((total) => ({ total })),
    RegisteredVoterCountObjectSchema,
  ]);

export const PrecinctWithSplitsRegisteredVoterCountsSchema: z.ZodType<PrecinctWithSplitsRegisteredVoterCounts> =
  z.strictObject({
    splits: z.record(z.string(), RegisteredVoterCountSchema),
  });

export const PrecinctRegisteredVoterCountEntrySchema: z.ZodType<PrecinctRegisteredVoterCountEntry> =
  z.union([
    RegisteredVoterCountSchema,
    PrecinctWithSplitsRegisteredVoterCountsSchema,
  ]);

export const ElectionRegisteredVoterCountsSchema: z.ZodType<ElectionRegisteredVoterCounts> =
  z.record(z.string(), PrecinctRegisteredVoterCountEntrySchema);

/**
 * Registered voter count totals in the format read by VxAdmin before counts
 * could be broken out by party.
 */
export type ElectionRegisteredVoterCountTotals = Record<
  PrecinctId,
  number | { splits: Record<PrecinctSplitId, number> }
>;

// Convert from object format to plain-number format.
export function toTotalRegisteredVoterCounts(
  counts: ElectionRegisteredVoterCounts
): ElectionRegisteredVoterCountTotals {
  const totals: ElectionRegisteredVoterCountTotals = {};
  for (const [precinctId, entry] of Object.entries(counts)) {
    if (isSplitCounts(entry)) {
      const splitTotals: Record<PrecinctSplitId, number> = {};
      for (const [splitId, count] of Object.entries(entry.splits)) {
        splitTotals[splitId] = count.total;
      }
      totals[precinctId] = { splits: splitTotals };
    } else {
      totals[precinctId] = entry.total;
    }
  }
  return totals;
}
