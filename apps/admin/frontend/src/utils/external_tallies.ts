import {
  Dictionary,
  Election,
  getContests,
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
import { combineContestTallies } from '@votingworks/utils';
import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';

import {
  getDistrictIdsForPartyId,
  getPartiesWithPrimaryElections,
} from './election';
import { getAdjudicatedWriteInCandidate } from './write_ins';
import { solveLinearSystem } from './linear_system';
import { convertSemsFileToExternalTally } from './sems_tallies';

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
  const ballotStyleToContestIds = Object.fromEntries(
    election.ballotStyles.map((bs) => [
      bs.id,
      getContests({ ballotStyle: bs, election }).map((c) => c.id),
    ])
  );
  // console.log(contestTallies);
  const augmentedMatrix = Object.entries(contestTallies).map(
    ([contestId, tally]) => [
      ...election.ballotStyles.map((ballotStyle) =>
        ballotStyleToContestIds[ballotStyle.id].includes(contestId) ? 1 : 0
      ),
      tally?.metadata.ballots ?? 0,
    ]
  );
  console.log(augmentedMatrix);
  console.log(augmentedMatrix.length, augmentedMatrix[0].length);
  console.log(augmentedMatrix.map((row) => row.join(' ')).join('\n'));
  const solution = solveLinearSystem(augmentedMatrix);
  console.log(solution);
  // TODO return an error for inconsistent tallies
  return solution?.reduce((a, b) => a + b, 0) ?? -1;
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
    console.log(precinctTally);
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
