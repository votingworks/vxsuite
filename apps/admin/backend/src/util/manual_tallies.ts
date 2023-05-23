import {
  BallotStyleId,
  Candidate,
  CandidateContest,
  CandidateId,
  ContestOptionTally,
  ContestTally,
  Dictionary,
  Election,
  Id,
  ManualTally,
  PartyId,
  TallyCategory,
  VotingMethod,
  YesNoContest,
  writeInCandidate as genericWriteInCandidate,
} from '@votingworks/types';
import { Optional, assert, assertDefined } from '@votingworks/basics';
import {
  getEmptyCandidateContestTally,
  getEmptyManualTally,
  getEmptyYesNoContestTally,
} from '@votingworks/utils';
import { Store } from '../store';
import {
  ServerFullElectionManualTally,
  WriteInCandidateRecord,
} from '../types';

function combineManualYesNoContestTallies({
  contest,
  contestTallies,
}: {
  contest: YesNoContest;
  contestTallies: ContestTally[];
}): ContestTally {
  if (contestTallies.length === 0) {
    return getEmptyYesNoContestTally(contest);
  }

  let overvotes = 0;
  let undervotes = 0;
  let ballots = 0;
  let yesCount = 0;
  let noCount = 0;
  for (const contestTally of contestTallies) {
    overvotes += contestTally.metadata.overvotes;
    undervotes += contestTally.metadata.undervotes;
    ballots += contestTally.metadata.ballots;
    yesCount += assertDefined(contestTally.tallies['yes']).tally;
    noCount += assertDefined(contestTally.tallies['no']).tally;
  }

  return {
    contest,
    tallies: {
      yes: {
        option: ['yes'],
        tally: yesCount,
      },
      no: {
        option: ['no'],
        tally: noCount,
      },
    },
    metadata: {
      undervotes,
      overvotes,
      ballots,
    },
  };
}

function combineManualCandidateContestTallies({
  contest,
  contestTallies,
  writeInCandidates,
  mergeWriteIns,
}: {
  contest: CandidateContest;
  contestTallies: ContestTally[];
  writeInCandidates: WriteInCandidateRecord[];
  mergeWriteIns: boolean;
}): ContestTally {
  if (contestTallies.length === 0) {
    return getEmptyCandidateContestTally(contest);
  }

  const contestWriteInCandidates = writeInCandidates.filter(
    (c) => c.contestId === contest.id
  );

  // iterate through all the tallies, summing counts
  let overvotes = 0;
  let undervotes = 0;
  let ballots = 0;
  const officialCandidateCounts: Record<CandidateId, number> = {};
  const writeInCandidateCounts: Record<Id, number> = {};
  for (const contestTally of contestTallies) {
    overvotes += contestTally.metadata.overvotes;
    undervotes += contestTally.metadata.undervotes;
    ballots += contestTally.metadata.ballots;
    for (const candidate of contest.candidates) {
      const candidateTally = contestTally.tallies[candidate.id];
      if (candidateTally) {
        officialCandidateCounts[candidate.id] =
          (officialCandidateCounts[candidate.id] ?? 0) + candidateTally.tally;
      }
    }
    for (const writeInCandidate of contestWriteInCandidates) {
      const writeInCandidateTally = contestTally.tallies[writeInCandidate.id];
      if (writeInCandidateTally) {
        writeInCandidateCounts[writeInCandidate.id] =
          (writeInCandidateCounts[writeInCandidate.id] ?? 0) +
          writeInCandidateTally.tally;
      }
    }
  }

  // format official candidate counts for the ContestTally
  const combinedCandidateTallies: Dictionary<ContestOptionTally> = {};
  for (const candidate of contest.candidates) {
    combinedCandidateTallies[candidate.id] = {
      option: candidate,
      tally: officialCandidateCounts[candidate.id] ?? 0,
    };
  }

  // if merging write-ins, combine all write-in votes under generic write-in
  if (mergeWriteIns) {
    const totalWriteInCount = Object.values(writeInCandidateCounts).reduce(
      (acc, cur) => acc + cur,
      0
    );
    combinedCandidateTallies[genericWriteInCandidate.id] = {
      option: genericWriteInCandidate,
      tally: totalWriteInCount,
    };
  } else {
    // if not merging write-ins, format write-in counts for the combined ContestTally.
    // only includes if write-in candidates seen in at least one of the contest tallies
    for (const writeInCandidate of contestWriteInCandidates) {
      const numVotesForWriteInCandidate =
        writeInCandidateCounts[writeInCandidate.id];
      if (numVotesForWriteInCandidate !== undefined) {
        combinedCandidateTallies[writeInCandidate.id] = {
          option: {
            id: writeInCandidate.id,
            name: writeInCandidate.name,
            isWriteIn: true,
          },
          tally: numVotesForWriteInCandidate,
        };
      }
    }
  }

  return {
    contest,
    tallies: combinedCandidateTallies,
    metadata: {
      undervotes,
      overvotes,
      ballots,
    },
  };
}

/**
 * Combine a list of manual tallies into a single manual tally.
 */
export function combineManualTallies({
  manualTallies,
  election,
  writeInCandidates,
  mergeWriteIns,
}: {
  manualTallies: ManualTally[];
  election: Election;
  writeInCandidates: WriteInCandidateRecord[];
  mergeWriteIns: boolean;
}): ManualTally {
  const combinedContestTallies: Dictionary<ContestTally> = {};

  for (const contest of election.contests) {
    const contestTallies = manualTallies
      .map((manualTally) => manualTally.contestTallies[contest.id])
      .filter(
        (contestTally): contestTally is ContestTally =>
          contestTally !== undefined
      );

    // the contest may not be relevant for this set of manual tallies
    if (contestTallies.length === 0) {
      continue;
    }

    if (contest.type === 'yesno') {
      combinedContestTallies[contest.id] = combineManualYesNoContestTallies({
        contest,
        contestTallies,
      });
    } else {
      combinedContestTallies[contest.id] = combineManualCandidateContestTallies(
        {
          contest,
          contestTallies,
          writeInCandidates,
          mergeWriteIns,
        }
      );
    }
  }

  const combinedNumberOfBallotsCounted = manualTallies.reduce(
    (acc, cur) => acc + cur.numberOfBallotsCounted,
    0
  );

  return {
    numberOfBallotsCounted: combinedNumberOfBallotsCounted,
    contestTallies: combinedContestTallies,
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

  // TODO: wire up frontend so it can handle multiple ballot types. for now
  // we are only providing precinct manual tallies to frontend tallying
  const manualTallyRecords = store.getManualTallies({
    electionId,
    ballotType: 'precinct',
  });
  if (manualTallyRecords.length === 0) return undefined;

  const writeInCandidates = store.getWriteInCandidates({ electionId });

  // calculate manual tallies for each precinct
  const manualTalliesByPrecinct: Dictionary<ManualTally> = {};
  for (const precinct of election.precincts) {
    const precinctManualTallies = manualTallyRecords
      .filter(({ precinctId }) => precinctId === precinct.id)
      .map(({ manualTally }) => manualTally);
    manualTalliesByPrecinct[precinct.id] =
      precinctManualTallies.length === 0
        ? getEmptyManualTally(election)
        : combineManualTallies({
            manualTallies: [...precinctManualTallies],
            election,
            writeInCandidates,
            mergeWriteIns: false,
          });
  }

  const ballotStyleIdsByPartyId: Record<PartyId, BallotStyleId[]> = {};
  for (const ballotStyle of election.ballotStyles) {
    if (ballotStyle.partyId) {
      ballotStyleIdsByPartyId[ballotStyle.partyId] = [
        ...(ballotStyleIdsByPartyId[ballotStyle.partyId] ?? []),
        ballotStyle.id,
      ];
    }
  }

  const manualTalliesByParty: Dictionary<ManualTally> = {};
  for (const [partyId, ballotStyleIds] of Object.entries(
    ballotStyleIdsByPartyId
  )) {
    const partyManualTallies = manualTallyRecords
      .filter(({ ballotStyleId }) => ballotStyleIds.includes(ballotStyleId))
      .map(({ manualTally }) => manualTally);
    manualTalliesByParty[partyId] = combineManualTallies({
      manualTallies: [...partyManualTallies],
      election,
      writeInCandidates,
      mergeWriteIns: false,
    });
  }

  const overallTally = combineManualTallies({
    manualTallies: manualTallyRecords.map(({ manualTally }) => manualTally),
    election,
    writeInCandidates,
    mergeWriteIns: false,
  });

  let oldestCreatedAt = new Date();
  for (const { createdAt } of manualTallyRecords) {
    const createdAtDate = new Date(createdAt);
    if (createdAtDate < oldestCreatedAt) oldestCreatedAt = createdAtDate;
  }

  return {
    votingMethod: VotingMethod.Precinct,
    timestampCreated: oldestCreatedAt,
    overallTally,
    resultsByCategory: {
      [TallyCategory.Precinct]: manualTalliesByPrecinct,
      [TallyCategory.Party]: manualTalliesByParty,
    },
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
