import { assert } from '@votingworks/basics';
import { getStateFeaturesConfig } from '@votingworks/election-definition-backend';
import {
  type Election,
  type ElectionRegisteredVoterCounts,
  ElectionRegisteredVoterCountsSchema,
  listRegisteredVoterCounts,
  type Precinct,
} from '@votingworks/types';
import { hasValidRegisteredVoterCountParties } from '@votingworks/utils';
import type { Jurisdiction } from './types.js';

export interface RegisteredVoterCountBreakdownConfig {
  readonly byParty: boolean;
  readonly nonpartisan: boolean;
}

/**
 * Which breakdowns an election's registered voter counts must have.
 */
export function getRegisteredVoterCountBreakdownConfig(
  jurisdiction: Jurisdiction,
  election: Election
): RegisteredVoterCountBreakdownConfig {
  const stateFeatures = getStateFeaturesConfig(jurisdiction);
  const byParty =
    election.type === 'primary' &&
    // v4.0 software can only read totals, so v4.0 jurisdictions never
    // have breakdowns
    jurisdiction.softwareVersion !== 'v4.0' &&
    stateFeatures.REGISTERED_VOTER_COUNTS_BY_PARTY === true;
  return {
    byParty,
    nonpartisan:
      byParty && stateFeatures.NONPARTISAN_REGISTERED_VOTER_COUNT === true,
  };
}

/**
 * Describes the first count that doesn't have exactly the required breakdowns,
 * or returns undefined if every count does.
 */
export function findRegisteredVoterCountBreakdownError(
  precincts: readonly Precinct[],
  counts: ElectionRegisteredVoterCounts,
  config: RegisteredVoterCountBreakdownConfig
): string | undefined {
  for (const { count } of listRegisteredVoterCounts(precincts, counts)) {
    if (count === undefined) continue;
    if (!config.byParty) {
      if (count.byParty !== undefined) {
        return 'Registered voter counts must not be broken out by party';
      }
      continue;
    }
    if (count.byParty === undefined) {
      return 'Registered voter counts must be broken out by party';
    }
    if (config.nonpartisan && count.nonpartisan === undefined) {
      return 'Registered voter counts by party must include a nonpartisan count';
    }
    if (!config.nonpartisan && count.nonpartisan !== undefined) {
      return 'Registered voter counts by party must not include a nonpartisan count';
    }
  }
  return undefined;
}

/**
 * Asserts that each count's party breakdown sums to its total, includes the
 * right parties, and is present only where the election requires one.
 */
export function assertValidRegisteredVoterCountBreakdowns(
  jurisdiction: Jurisdiction,
  election: Election,
  counts: ElectionRegisteredVoterCounts
): void {
  assert(
    ElectionRegisteredVoterCountsSchema.safeParse(counts).success,
    'Party and nonpartisan registered voter counts must sum to the total'
  );
  assert(
    hasValidRegisteredVoterCountParties(election, counts),
    'Registered voter counts by party must include every party with a ballot style in each precinct and split, and only parties with a ballot style in the election'
  );
  const breakdownError = findRegisteredVoterCountBreakdownError(
    election.precincts,
    counts,
    getRegisteredVoterCountBreakdownConfig(jurisdiction, election)
  );
  assert(breakdownError === undefined, breakdownError);
}
