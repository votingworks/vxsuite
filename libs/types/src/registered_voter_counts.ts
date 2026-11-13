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
export interface PartyRegisteredVoterCounts {
  readonly total: number;
  readonly byParty?: Record<PartyId, number>;
  readonly nonpartisan?: number;
}

/**
 * Registered voter count for a precinct or split. A number is a total with no
 * breakdown by voter party affiliation.
 */
export type RegisteredVoterCount = number | PartyRegisteredVoterCounts;

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
  return typeof entry === 'object' && 'splits' in entry;
}

export function isPrecinctCount(
  entry: PrecinctRegisteredVoterCountEntry
): entry is RegisteredVoterCount {
  return !isSplitCounts(entry);
}

export function getTotalRegisteredVoterCount(
  count: RegisteredVoterCount
): number {
  return typeof count === 'number' ? count : count.total;
}

export function getPartyRegisteredVoterCounts(
  count: RegisteredVoterCount
): Record<PartyId, number> | undefined {
  return typeof count === 'number' ? undefined : count.byParty;
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
    (count) => getPartyRegisteredVoterCounts(count) !== undefined
  ).length;

  const someMissingCount = setCounts.length < allCounts.length;
  const someMissingBreakdown =
    breakdownCount > 0 && breakdownCount < setCounts.length;

  return (setCounts.length > 0 && someMissingCount) || someMissingBreakdown;
}

const CountSchema = z.number().int().nonnegative();

export const PartyRegisteredVoterCountsSchema: z.ZodType<PartyRegisteredVoterCounts> =
  z
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

export const RegisteredVoterCountSchema: z.ZodType<RegisteredVoterCount> =
  z.union([CountSchema, PartyRegisteredVoterCountsSchema]);

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
