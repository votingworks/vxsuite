import type { StateFeaturesConfig } from '@votingworks/election-definition-backend';
import {
  type BallotStyle,
  type Contest,
  type ElectionRegisteredVoterCounts,
  type ElectionType,
  getPrecinctsWithoutAbsenteePollingPlace,
  hasPartialRegisteredVoterCounts,
  type PollingPlace,
  type Precinct,
} from '@votingworks/types';

/** Why an election's ballots can't be finalized yet. */
export interface FinalizeBlocker {
  title: string;
  message: string;
}

/**
 * Returns the first reason the election's ballots can't be finalized, if any.
 */
export function getFinalizeBlocker({
  appName,
  features,
  electionType,
  ballotStyles,
  contests,
  precincts,
  registeredVoterCounts,
  pollingPlaces,
}: {
  appName: string;
  features: StateFeaturesConfig;
  electionType: ElectionType;
  ballotStyles: readonly BallotStyle[];
  contests: readonly Contest[];
  precincts: readonly Precinct[];
  registeredVoterCounts: ElectionRegisteredVoterCounts;
  pollingPlaces: readonly PollingPlace[];
}): FinalizeBlocker | undefined {
  if (ballotStyles.length === 0) {
    return {
      title: 'Ballots Incomplete',
      message: `${appName} will create ballot styles for your election once you have created districts, precincts, and contests.`,
    };
  }

  if (
    features.STRAIGHT_PARTY_VOTING &&
    electionType === 'general' &&
    !contests.some((contest) => contest.type === 'straight-party')
  ) {
    return {
      title: 'Cannot generate straight party contest',
      message:
        'To generate the straight party contest, the election must include a district that covers every precinct.',
    };
  }

  if (hasPartialRegisteredVoterCounts(precincts, registeredVoterCounts)) {
    return {
      title:
        'Registered voter counts must be provided for all precincts and splits, or none.',
      message:
        'Registered voter counts are set for some precincts but not all. Set counts for all precincts or remove them from all precincts before finalizing.',
    };
  }

  if (
    features.EDIT_POLLING_PLACES &&
    !features.OMIT_ABSENTEE_POLLING_PLACES &&
    getPrecinctsWithoutAbsenteePollingPlace(precincts, pollingPlaces).length > 0
  ) {
    return {
      title: 'Absentee polling places must cover every precinct.',
      message:
        'Every precinct must be covered by an absentee polling place, so that centrally-scanned ballots have a location to be tabulated under. Add or edit absentee polling places to cover all precincts before finalizing.',
    };
  }

  return undefined;
}
