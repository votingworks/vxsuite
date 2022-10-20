import {
  ContestOptionTally,
  ContestTally,
  Dictionary,
  Election,
  FullElectionTally,
  getPartyIdsInBallotStyles,
  PrecinctSelection,
  Tally,
} from '@votingworks/types';
import { assert } from './assert';
import { getTallyIdentifier } from './compressed_tallies';
import { filterTalliesByParams } from './votes';

export function combineContestTallies(
  firstTally: ContestTally,
  secondTally: ContestTally
): ContestTally {
  assert(firstTally.contest.id === secondTally.contest.id);
  const combinedTallies: Dictionary<ContestOptionTally> = {};

  for (const optionId of Object.keys(firstTally.tallies)) {
    const firstTallyOption = firstTally.tallies[optionId];
    assert(firstTallyOption);
    const secondTallyOption = secondTally.tallies[optionId];
    combinedTallies[optionId] = {
      option: firstTallyOption.option,
      tally: firstTallyOption.tally + (secondTallyOption?.tally ?? 0),
    };
  }

  return {
    contest: firstTally.contest,
    tallies: combinedTallies,
    metadata: {
      overvotes: firstTally.metadata.overvotes + secondTally.metadata.overvotes,
      undervotes:
        firstTally.metadata.undervotes + secondTally.metadata.undervotes,
      ballots: firstTally.metadata.ballots + secondTally.metadata.ballots,
    },
  };
}

export function getSubTalliesByPartyAndPrecinct({
  election,
  tally,
  precinctSelection,
}: {
  election: Election;
  tally: FullElectionTally;
  precinctSelection?: PrecinctSelection;
}): Map<string, Tally> {
  const newSubTallies = new Map();
  const precinctIdList = precinctSelection
    ? precinctSelection.kind === 'AllPrecincts'
      ? election.precincts.map(({ id }) => id)
      : [precinctSelection.precinctId]
    : [undefined];

  for (const partyId of getPartyIdsInBallotStyles(election)) {
    for (const precinctId of precinctIdList) {
      const filteredTally = filterTalliesByParams(tally, election, {
        precinctId,
        partyId,
      });
      newSubTallies.set(getTallyIdentifier(partyId, precinctId), filteredTally);
    }
  }
  return newSubTallies;
}
