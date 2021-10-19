import { strict as assert } from 'assert';
import {
  ContestOptionTally,
  ContestTally,
  Dictionary,
} from '@votingworks/types';

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
