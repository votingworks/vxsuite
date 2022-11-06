import {
  Dictionary,
  Election,
  getContests,
  expandEitherNeitherContests,
  ContestOptionTally,
  ContestTally,
  ExternalTally,
  ExternalTallySourceType,
  FullElectionExternalTally,
  OptionalExternalTally,
  OptionalFullElectionExternalTally,
  TallyCategory,
  VotingMethod,
  PartyId,
  PrecinctId,
  FullElectionExternalTallies,
  ContestId,
} from '@votingworks/types';
import {
  assert,
  throwIllegalValue,
  combineContestTallies,
} from '@votingworks/utils';

import {
  getDistrictIdsForPartyId,
  getPartiesWithPrimaryElections,
} from './election';
import { getAdjudicatedWriteInCandidate } from './write_ins';

export function convertExternalTalliesToStorageString(
  tallies: FullElectionExternalTallies
): string {
  return JSON.stringify(
    Array.from(tallies.values()).map((tally) => {
      return {
        ...tally,
        resultsByCategory: Array.from(tally.resultsByCategory.entries()),
        timestampCreated: tally.timestampCreated.getTime(),
      };
    })
  );
}

export function convertStorageStringToExternalTallies(
  inputString: string
): FullElectionExternalTally[] {
  const parsedJson = JSON.parse(inputString) as Array<Record<string, unknown>>;
  return parsedJson.map((data) => {
    const {
      overallTally,
      resultsByCategory,
      votingMethod,
      source,
      inputSourceName,
      timestampCreated,
    } = data;
    return {
      overallTally,
      votingMethod,
      source,
      inputSourceName,
      resultsByCategory: new Map(
        resultsByCategory as ReadonlyArray<readonly [unknown, unknown]>
      ),
      timestampCreated: new Date(timestampCreated as number),
    } as unknown as FullElectionExternalTally;
  });
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

export function getEmptyExternalTally(): ExternalTally {
  return {
    contestTallies: {},
    numberOfBallotsCounted: 0,
  };
}

export function getPrecinctIdsInExternalTally(
  tally: FullElectionExternalTally
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
  tally: ExternalTally,
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

export function filterExternalTalliesByParams(
  fullTally: OptionalFullElectionExternalTally,
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
): OptionalExternalTally {
  if (!fullTally || scannerId || batchId) {
    return undefined;
  }

  if (votingMethod && fullTally.votingMethod !== votingMethod) {
    return getEmptyExternalTally();
  }

  const { overallTally, resultsByCategory } = fullTally;

  let filteredTally = overallTally;

  if (precinctId) {
    filteredTally =
      resultsByCategory.get(TallyCategory.Precinct)?.[precinctId] ||
      getEmptyExternalTally();
  }

  if (!partyId) {
    return filteredTally;
  }

  return filterTallyForPartyId(filteredTally, partyId, election);
}

export function convertTalliesByPrecinctToFullExternalTally(
  talliesByPrecinct: Dictionary<ExternalTally>,
  election: Election,
  votingMethod: VotingMethod,
  source: ExternalTallySourceType,
  inputSourceName: string,
  timestampCreated: Date
): FullElectionExternalTally {
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

  const overallTally: ExternalTally = {
    contestTallies: overallContestTallies,
    numberOfBallotsCounted: totalNumberOfBallots,
  };

  const resultsByCategory = new Map();
  resultsByCategory.set(TallyCategory.Precinct, talliesByPrecinct);

  // Compute results filtered by party, this filters the sets of contests and requires recomputing the number of ballots counted.
  const contestTalliesByParty: Dictionary<ExternalTally> = {};
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
    inputSourceName,
    source,
    timestampCreated,
  };
}

export function getEmptyContestTallies(
  election: Election,
  allAdjudicatedValues?: Map<ContestId, string[]>
): Dictionary<ContestTally> {
  const contestTallies: Dictionary<ContestTally> = {};
  for (const contest of expandEitherNeitherContests(election.contests)) {
    const optionTallies: Dictionary<ContestOptionTally> = {};
    switch (contest.type) {
      case 'candidate': {
        for (const candidate of contest.candidates) {
          optionTallies[candidate.id] = {
            option: candidate,
            tally: 0,
          };
        }
        if (contest.allowWriteIns && allAdjudicatedValues) {
          const adjudicatedValues = allAdjudicatedValues.get(contest.id);
          if (adjudicatedValues) {
            for (const adjudicatedValue of adjudicatedValues) {
              const adjudicatedCandidate = getAdjudicatedWriteInCandidate(
                adjudicatedValue,
                false
              );
              optionTallies[adjudicatedCandidate.id] = {
                option: adjudicatedCandidate,
                tally: 0,
              };
            }
          }
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

export function getEmptyExternalTalliesByPrecinct(
  election: Election,
  allAdjudicatedValues?: Map<ContestId, string[]>
): Dictionary<ExternalTally> {
  const tallies: Dictionary<ExternalTally> = {};
  for (const precinct of election.precincts) {
    tallies[precinct.id] = {
      contestTallies: getEmptyContestTallies(election, allAdjudicatedValues),
      numberOfBallotsCounted: 0,
    };
  }
  return tallies;
}
