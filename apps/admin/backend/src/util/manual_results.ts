import {
  type Id,
  type Tabulation,
  Admin as AdminTypes,
  type BallotStyleGroupId,
  type Election,
  getContests,
} from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import {
  areContestResultsValid,
  getBallotStyleGroup,
} from '@votingworks/utils';
import type { Store } from '../store.js';
import type {
  ManualResultsRecord,
  ManualResultsProgress,
  ManualResultsVotingMethod,
} from '../types.js';

/**
 * The manual results entry form allows creating new write-in candidates. These
 * are included in the manual results from the frontend prefaced by
 * `temp-write-in-`. This method creates the new write-in candidates in the
 * database, substitutes the ids in the passed `ManualElectionResults`, and strips out
 * any write-in references with zero votes. Edits the `ManualElectionResults` in place.
 */
function handleEnteredWriteInCandidateData({
  manualResults,
  electionId,
  store,
}: {
  manualResults: Tabulation.ManualElectionResults;
  electionId: Id;
  store: Store;
}): Tabulation.ManualElectionResults {
  for (const contestResults of Object.values(manualResults.contestResults)) {
    if (contestResults.contestType === 'candidate') {
      for (const [candidateId, candidateTally] of Object.entries(
        contestResults.tallies
      )) {
        if (candidateTally.isWriteIn) {
          if (candidateTally.tally === 0) {
            // if any write-in candidate has no votes, remove them from tally
            delete contestResults.tallies[candidateId];
          } else if (
            candidateId.startsWith(AdminTypes.TEMPORARY_WRITE_IN_ID_PREFIX)
          ) {
            const { contestId } = contestResults;
            // Check for existing write-in candidate before creating a new one.
            // The main reason for this check is for CDF ERR file import. All
            // write-ins in an ERR file will be tagged with TEMPORARY_WRITE_IN_ID_PREFIX
            // even if they conflict with existing write-in candiate rows.
            //
            // The manual results frontend only tags with TEMPORARY_WRITE_IN_ID_PREFIX
            // if it determines no conflicting write-in candidate exists. Therefore,
            // this check should no-op for manual results entered through the VxAdmin UI.
            const existingWriteInCandidateRecords = store.getWriteInCandidates({
              electionId,
              contestIds: [contestId],
            });

            const matchingRecord = existingWriteInCandidateRecords.find(
              (record) => record.name === candidateTally.name
            );

            const writeInCandidateRecord =
              matchingRecord ??
              store.addWriteInCandidate({
                electionId,
                contestId,
                name: candidateTally.name,
              });

            // For validated new write-in candidates, create records and substitute ids
            contestResults.tallies[writeInCandidateRecord.id] = {
              ...candidateTally,
              id: writeInCandidateRecord.id,
            };
            delete contestResults.tallies[candidateId];
          }
        }
      }
    }
  }

  return manualResults;
}

/**
 * The manual results entry form allows creating new write-in candidates. These
 * are included in the manual results from the frontend prefaced by
 * `temp-write-in-`. This method creates the new write-in candidates in the
 * database, substitutes the ids in the passed `ManualElectionResults`, and strips out
 * any write-in references with zero votes. Edits the `ManualElectionResults` in place.
 * After this transformation, the method writes to the manual_results table in the store.
 */
export async function transformWriteInsAndSetManualResults({
  manualResults,
  electionId,
  store,
  precinctId,
  ballotStyleGroupId,
  votingMethod,
}: {
  manualResults: Tabulation.ManualElectionResults;
  electionId: string;
  store: Store;
  precinctId: string;
  ballotStyleGroupId: BallotStyleGroupId;
  votingMethod: ManualResultsVotingMethod;
}): Promise<void> {
  await store.withTransaction(() => {
    const writeInAdjustedManualResults = handleEnteredWriteInCandidateData({
      manualResults,
      electionId,
      store,
    });

    store.setManualResults({
      electionId,
      precinctId,
      ballotStyleGroupId,
      votingMethod,
      manualResults: writeInAdjustedManualResults,
    });
    return Promise.resolve();
  });
}

/**
 * Summarizes how far along entry of a set of manual results is: how many of
 * the ballot style's contests have been entered, how many of those have
 * tallies that don't add up, and the first contest (in ballot order) that
 * is either not entered or doesn't add up.
 */
export function getManualResultsProgress(
  election: Election,
  resultsRecord: ManualResultsRecord
): ManualResultsProgress {
  const ballotStyleGroup = assertDefined(
    getBallotStyleGroup({
      election,
      ballotStyleGroupId: resultsRecord.ballotStyleGroupId,
    })
  );
  const contests = getContests({
    election,
    ballotStyle: ballotStyleGroup,
  }).filter((contest) => contest.type !== 'straight-party');
  const { contestResults } = resultsRecord.manualResults;
  const enteredContests = contests.filter(
    (contest) => contestResults[contest.id]
  );
  const invalidContests = enteredContests.filter(
    (contest) =>
      !areContestResultsValid(assertDefined(contestResults[contest.id]))
  );
  const firstUnresolvedContest = contests.find(
    (contest) =>
      !enteredContests.includes(contest) || invalidContests.includes(contest)
  );
  return {
    contestCount: contests.length,
    enteredContestCount: enteredContests.length,
    invalidContestCount: invalidContests.length,
    firstUnresolvedContestId: firstUnresolvedContest?.id,
  };
}
