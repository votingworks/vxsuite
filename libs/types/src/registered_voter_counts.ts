import { iter } from '@votingworks/basics';
import { z } from 'zod/v4';
import {
  hasSplits,
  type PartyId,
  type Precinct,
  type PrecinctId,
  type PrecinctOrSplit,
  type PrecinctSplitId,
} from './election.js';

/**
 * Registered voter count for a precinct or split with an optional breakdown by
 * voter party affiliation. When present, the party and nonpartisan counts sum
 * to the total.
 */
export interface RegisteredVoterCount {
  readonly total: number;
  readonly byParty?: Record<PartyId, number>;
  readonly nonpartisan?: number;
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

export function isSplitCounts(
  entry: PrecinctRegisteredVoterCountEntry
): entry is PrecinctWithSplitsRegisteredVoterCounts {
  return 'splits' in entry;
}

export function isPrecinctCount(
  entry: PrecinctRegisteredVoterCountEntry
): entry is RegisteredVoterCount {
  return !isSplitCounts(entry);
}

export interface PrecinctOrSplitRegisteredVoterCount {
  readonly precinctOrSplit: PrecinctOrSplit;
  readonly count?: RegisteredVoterCount;
}

/**
 * Lists each precinct's or split's count, or undefined where none is set.
 */
export function listRegisteredVoterCounts(
  precincts: readonly Precinct[],
  counts: ElectionRegisteredVoterCounts
): PrecinctOrSplitRegisteredVoterCount[] {
  return precincts.flatMap(
    (precinct): PrecinctOrSplitRegisteredVoterCount[] => {
      const entry = counts[precinct.id];
      if (hasSplits(precinct)) {
        return precinct.splits.map((split) => ({
          precinctOrSplit: { precinct, split },
          count:
            entry !== undefined && isSplitCounts(entry)
              ? entry.splits[split.id]
              : undefined,
        }));
      }
      return [
        {
          precinctOrSplit: { precinct },
          count:
            entry !== undefined && isPrecinctCount(entry) ? entry : undefined,
        },
      ];
    }
  );
}

/**
 * Whether counts are set for some, but not all, precincts and splits, or
 * whether some, but not all, counts are broken out by party.
 */
export function hasPartialRegisteredVoterCounts(
  precincts: readonly Precinct[],
  counts: ElectionRegisteredVoterCounts
): boolean {
  const allCounts = listRegisteredVoterCounts(precincts, counts).map(
    ({ count }) => count
  );
  const setCounts = allCounts.filter((count) => count !== undefined);
  const breakdownCount = setCounts.filter(
    (count) => count.byParty !== undefined
  ).length;

  const someMissingCount = setCounts.length < allCounts.length;
  const someMissingBreakdown =
    breakdownCount > 0 && breakdownCount < setCounts.length;

  return (setCounts.length > 0 && someMissingCount) || someMissingBreakdown;
}

const CountSchema = z.number().int().nonnegative();

const RegisteredVoterCountObjectSchema: z.ZodType<RegisteredVoterCount> = z
  .object({
    total: CountSchema,
    byParty: z.record(z.string(), CountSchema).optional(),
    nonpartisan: CountSchema.optional(),
  })
  .refine(
    ({ byParty, nonpartisan }) =>
      nonpartisan === undefined || byParty !== undefined,
    { message: 'A nonpartisan count requires party counts' }
  )
  .refine(
    ({ total, byParty, nonpartisan }) =>
      byParty === undefined ||
      iter(Object.values(byParty)).sum() + (nonpartisan ?? 0) === total,
    { message: 'Party and nonpartisan counts must sum to the total' }
  );

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
  z.object({
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

export function toTotalRegisteredVoterCounts(
  counts: ElectionRegisteredVoterCounts
): ElectionRegisteredVoterCountTotals {
  return Object.fromEntries(
    Object.entries(counts).map(([precinctId, entry]) => [
      precinctId,
      isSplitCounts(entry)
        ? {
            splits: Object.fromEntries(
              Object.entries(entry.splits).map(([splitId, count]) => [
                splitId,
                count.total,
              ])
            ),
          }
        : entry.total,
    ])
  );
}
