import {
  Dictionary,
  Election,
  getContests,
  ContestOptionTally,
  ContestTally,
  ManualTally,
  FullElectionManualTally,
  OptionalManualTally,
  OptionalFullElectionManualTally,
  TallyCategory,
  VotingMethod,
  PartyId,
  PrecinctId,
} from '@votingworks/types';
import { combineContestTallies } from '@votingworks/utils';
import { assert, throwIllegalValue } from '@votingworks/basics';

import {
  getDistrictIdsForPartyId,
  getPartiesWithPrimaryElections,
} from './election';

export function convertManualTallyToStorageString(
  tally: FullElectionManualTally
): string {
  return JSON.stringify({
    ...tally,
    resultsByCategory: Array.from(tally.resultsByCategory.entries()),
    timestampCreated: tally.timestampCreated.getTime(),
  });
}

export function convertStorageStringToManualTally(
  inputString: string
): FullElectionManualTally {
  const parsedJson = JSON.parse(inputString) as Record<string, unknown>;
  const { overallTally, resultsByCategory, votingMethod, timestampCreated } =
    parsedJson;
  return {
    overallTally,
    votingMethod,
    resultsByCategory: new Map(
      resultsByCategory as ReadonlyArray<readonly [unknown, unknown]>
    ),
    timestampCreated: new Date(timestampCreated as number),
  } as unknown as FullElectionManualTally;
}

export function getTotalNumberOfBallots(
  contestTallies: Dictionary<ContestTally>,
  election: Election
): number {
  // Get Separate Ballot Style Sets
  // Get Contest IDs by Ballot Style
  let contestIdSets = election.ballotStyles.map((bs) => {
    return new Set(
      getContests({
        ballotStyle: bs,
        election,
      }).map((c) => c.id)
    );
  });

  // Break the sets of contest IDs into disjoint sets, so contests that are never seen on the same ballot style.
  for (const contest of election.contests) {
    const combinedSetForContest = new Set<string>();
    const newListOfContestIdSets: Array<Set<string>> = [];
    for (const contestIdSet of contestIdSets) {
      if (contestIdSet.has(contest.id)) {
        for (const id of contestIdSet) combinedSetForContest.add(id);
      } else {
        newListOfContestIdSets.push(contestIdSet);
      }
    }
    newListOfContestIdSets.push(combinedSetForContest);
    contestIdSets = newListOfContestIdSets;
  }

  // Within each ballot set find the maximum number of ballots cast on a contest, that is the number of ballots cast amongst ballot styles represented.
  const ballotsCastPerSet = contestIdSets.map((set) =>
    [...set].reduce(
      (prevValue, contestId) =>
        Math.max(prevValue, contestTallies[contestId]?.metadata.ballots || 0),
      0
    )
  );

  // Sum across disjoint sets of ballot styles to get the total number of ballots cast.
  return ballotsCastPerSet.reduce(
    (prevValue, maxBallotCount) => prevValue + maxBallotCount,
    0
  );
}

export function getEmptyManualTally(): ManualTally {
  return {
    contestTallies: {},
    numberOfBallotsCounted: 0,
  };
}

export function getPrecinctIdsInManualTally(
  tally: FullElectionManualTally
): string[] {
  const resultsByPrecinct = tally.resultsByCategory.get(TallyCategory.Precinct);
  if (resultsByPrecinct) {
    const precinctsWithBallots: string[] = [];
    for (const precinctId of Object.keys(resultsByPrecinct)) {
      if ((resultsByPrecinct[precinctId]?.numberOfBallotsCounted ?? 0) > 0) {
        precinctsWithBallots.push(precinctId);
      }
    }
    return precinctsWithBallots;
  }
  return [];
}

function filterTallyForPartyId(
  tally: ManualTally,
  partyId: PartyId,
  election: Election
) {
  // Filter contests by party and recompute the number of ballots based on those contests.
  const districtsForParty = getDistrictIdsForPartyId(election, partyId);
  const filteredContestTallies: Dictionary<ContestTally> = {};
  for (const contestId of Object.keys(tally.contestTallies)) {
    const contestTally = tally.contestTallies[contestId];
    if (
      contestTally &&
      districtsForParty.includes(contestTally.contest.districtId) &&
      contestTally.contest.type === 'candidate' &&
      contestTally.contest.partyId === partyId
    ) {
      filteredContestTallies[contestId] = contestTally;
    }
  }
  const numberOfBallotsCounted = getTotalNumberOfBallots(
    filteredContestTallies,
    election
  );
  return {
    contestTallies: filteredContestTallies,
    numberOfBallotsCounted,
  };
}

export function filterManualTalliesByParams(
  fullTally: OptionalFullElectionManualTally,
  election: Election,
  {
    precinctId,
    partyId,
    scannerId,
    votingMethod,
    batchId,
  }: {
    precinctId?: PrecinctId;
    partyId?: PartyId;
    scannerId?: string;
    votingMethod?: VotingMethod;
    batchId?: string;
  }
): OptionalManualTally {
  if (!fullTally || scannerId || batchId) {
    return undefined;
  }

  if (votingMethod && fullTally.votingMethod !== votingMethod) {
    return getEmptyManualTally();
  }

  const { overallTally, resultsByCategory } = fullTally;

  let filteredTally = overallTally;

  if (precinctId) {
    filteredTally =
      resultsByCategory.get(TallyCategory.Precinct)?.[precinctId] ||
      getEmptyManualTally();
  }

  if (!partyId) {
    return filteredTally;
  }

  return filterTallyForPartyId(filteredTally, partyId, election);
}

export function convertTalliesByPrecinctToFullManualTally(
  talliesByPrecinct: Dictionary<ManualTally>,
  election: Election,
  votingMethod: VotingMethod,
  timestampCreated: Date
): FullElectionManualTally {
  let totalNumberOfBallots = 0;
  const overallContestTallies: Dictionary<ContestTally> = {};
  for (const precinctTally of Object.values(talliesByPrecinct)) {
    assert(precinctTally);
    totalNumberOfBallots += precinctTally.numberOfBallotsCounted;
    for (const contestId of Object.keys(precinctTally.contestTallies)) {
      if (!(contestId in overallContestTallies)) {
        overallContestTallies[contestId] =
          precinctTally.contestTallies[contestId];
      } else {
        const existingContestTallies = overallContestTallies[contestId];
        const secondTally = precinctTally.contestTallies[contestId];
        assert(existingContestTallies);
        assert(secondTally);
        overallContestTallies[contestId] = combineContestTallies(
          existingContestTallies,
          secondTally
        );
      }
    }
  }

  const overallTally: ManualTally = {
    contestTallies: overallContestTallies,
    numberOfBallotsCounted: totalNumberOfBallots,
  };

  const resultsByCategory = new Map();
  resultsByCategory.set(TallyCategory.Precinct, talliesByPrecinct);

  // Compute results filtered by party, this filters the sets of contests and requires recomputing the number of ballots counted.
  const contestTalliesByParty: Dictionary<ManualTally> = {};
  const partiesInElection = getPartiesWithPrimaryElections(election);
  for (const party of partiesInElection) {
    contestTalliesByParty[party.id] = filterTallyForPartyId(
      overallTally,
      party.id,
      election
    );
  }
  resultsByCategory.set(TallyCategory.Party, contestTalliesByParty);

  return {
    overallTally,
    resultsByCategory,
    votingMethod,
    timestampCreated,
  };
}

export function getEmptyContestTallies(
  election: Election
): Dictionary<ContestTally> {
  const contestTallies: Dictionary<ContestTally> = {};
  for (const contest of election.contests) {
    const optionTallies: Dictionary<ContestOptionTally> = {};
    switch (contest.type) {
      case 'candidate': {
        for (const candidate of contest.candidates) {
          optionTallies[candidate.id] = {
            option: candidate,
            tally: 0,
          };
        }
        break;
      }
      case 'yesno': {
        optionTallies['yes'] = {
          option: ['yes'],
          tally: 0,
        };
        optionTallies['no'] = {
          option: ['no'],
          tally: 0,
        };
        break;
      }
      default:
        throwIllegalValue(contest, 'type');
    }
    contestTallies[contest.id] = {
      contest,
      tallies: optionTallies,
      metadata: { overvotes: 0, undervotes: 0, ballots: 0 },
    };
  }
  return contestTallies;
}

export function getEmptyManualTalliesByPrecinct(
  election: Election
): Dictionary<ManualTally> {
  const tallies: Dictionary<ManualTally> = {};
  for (const precinct of election.precincts) {
    tallies[precinct.id] = {
      contestTallies: getEmptyContestTallies(election),
      numberOfBallotsCounted: 0,
    };
  }
  return tallies;
}
