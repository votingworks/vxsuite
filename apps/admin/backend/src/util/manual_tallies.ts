import {
  Candidate,
  ContestOptionTally,
  ContestTally,
  Dictionary,
  Election,
  FullElectionManualTally,
  Id,
  ManualTally,
  Party,
  PartyId,
  TallyCategory,
  VotingMethod,
  getContests,
} from '@votingworks/types';
import {
  Optional,
  assert,
  collections,
  throwIllegalValue,
} from '@votingworks/basics';
import { combineContestTallies } from '@votingworks/utils';
import { Store } from '../store';
import { ServerFullElectionManualTally } from '../types';

function getDistrictIdsForPartyId(
  election: Election,
  partyId: PartyId
): string[] {
  return election.ballotStyles
    .filter((bs) => bs.partyId === partyId)
    .flatMap((bs) => bs.districts);
}

function getPartiesWithPrimaryElections(election: Election): Party[] {
  const partyIds = election.ballotStyles
    .map((bs) => bs.partyId)
    .filter((id): id is PartyId => id !== undefined);
  return election.parties.filter((party) => partyIds.includes(party.id));
}

/**
 * @deprecated Copied from `admin/frontend` to use during manual tally data
 * transition. Does not produce reliable ballot count.
 */
function getTotalNumberOfBallots(
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

/**
 * @deprecated Copied from `admin/frontend` to use during manual tally data
 * transition. Unable to filter non-partisan races in primary elections.
 */
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

function getEmptyContestTallies(election: Election): Dictionary<ContestTally> {
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

/**
 * @deprecated Copied from `admin/frontend` to use during manual tally data
 * transition.
 */
function getEmptyManualTalliesByPrecinct(
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

/**
 * @deprecated Copied from `admin/frontend` to use during manual tally data
 * transition. We use this to create a {@link FullElectionManualTally} which
 * will no longer be served to the frontend once tally reports are created on
 * the backend.
 */
function convertTalliesByPrecinctToFullManualTally(
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

/**
 * The frontend currently consumes manual tally data as a
 * {@link FullElectionManualTally}, although that will soon change. For now, this
 * method gathers data from the store and constructs the `FullElectionTally`.
 */
export function buildFullElectionManualTallyFromStore(
  store: Store,
  electionId: Id
): Optional<ServerFullElectionManualTally> {
  const electionRecord = store.getElection(electionId);
  assert(electionRecord);
  const { electionDefinition } = electionRecord;
  const { election } = electionDefinition;

  const manualTallyRecords = store.getManualTallies({ electionId });
  if (manualTallyRecords.length === 0) return undefined;

  const manualTalliesByPrecinct: Dictionary<ManualTally> =
    getEmptyManualTalliesByPrecinct(election);
  let oldestCreatedAt = new Date();
  for (const { precinctId, manualTally, createdAt } of manualTallyRecords) {
    manualTalliesByPrecinct[precinctId] = manualTally;
    const createdAtDate = new Date(createdAt);
    if (createdAtDate < oldestCreatedAt) oldestCreatedAt = createdAtDate;
  }

  const fullElectionManualTally = convertTalliesByPrecinctToFullManualTally(
    manualTalliesByPrecinct,
    election,
    VotingMethod.Precinct,
    oldestCreatedAt
  );

  return {
    ...fullElectionManualTally,
    resultsByCategory: collections.reduce(
      fullElectionManualTally.resultsByCategory,
      (dictionary, indexedTallies, indexKey) => {
        return {
          ...dictionary,
          [indexKey]: indexedTallies,
        };
      },
      {}
    ),
  };
}

/**
 * The manual tally entry form allows creating new write-in candidates. These
 * are included in the manual tally from the frontend prefaced by
 * `temp-write-in-`. This method creates the new write-in candidates in the
 * database, substitutes the ids in the passed `ManualTally`, and strips out
 * any write-in references with zero votes. Edits the `ManualTally` in place.
 */
export function handleEnteredWriteInCandidateData({
  manualTally,
  electionId,
  store,
}: {
  manualTally: ManualTally;
  electionId: Id;
  store: Store;
}): ManualTally {
  for (const contestTally of Object.values(manualTally.contestTallies)) {
    assert(contestTally);
    if (contestTally.contest.type === 'candidate') {
      for (const [optionId, optionTally] of Object.entries(
        contestTally.tallies
      )) {
        assert(optionTally);
        const candidate = optionTally?.option as Candidate;
        if (candidate.isWriteIn) {
          if (optionTally.tally === 0) {
            // if any write-in candidate has no votes, remove them from tally
            delete contestTally.tallies[optionId];
          } else if (candidate.id.startsWith('temp-write-in-')) {
            // for temp-write-in candidates, create records and substitute ids
            const writeInCandidateRecord = store.addWriteInCandidate({
              electionId,
              contestId: contestTally.contest.id,
              name: candidate.name,
            });
            contestTally.tallies[writeInCandidateRecord.id] = {
              ...optionTally,
              option: {
                ...candidate,
                id: writeInCandidateRecord.id,
              },
            };
            delete contestTally.tallies[candidate.id];
          }
        }
      }
    }
  }

  return manualTally;
}
