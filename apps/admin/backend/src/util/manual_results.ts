import {
  Id,
  Tabulation,
  Admin as AdminTypes,
  BallotStyleGroupId,
  Election,
  getContests,
} from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import {
  areContestResultsValid,
  getBallotStyleGroup,
} from '@votingworks/utils';
import { Store } from '../store';
import {
  ManualResultsRecord,
  ManualResultsValidationError,
  ManualResultsVotingMethod,
} from '../types';

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
              contestId,
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
 * Validates that a set of manual results are complete and valid, returning a
 * {@link ManualResultsValidationError} if not.
 */
export function validateManualResults(
  election: Election,
  resultsRecord: ManualResultsRecord
): ManualResultsValidationError | undefined {
  const anyInvalidContests = !Object.values(
    resultsRecord.manualResults.contestResults
  ).every(areContestResultsValid);
  const ballotStyleGroup = assertDefined(
    getBallotStyleGroup({
      election,
      ballotStyleGroupId: resultsRecord.ballotStyleGroupId,
    })
  );
  const contests = getContests({
    election,
    ballotStyle: ballotStyleGroup,
  });
  const anyMissingContests = contests.some(
    (contest) => !resultsRecord.manualResults.contestResults[contest.id]
  );
  return anyInvalidContests
    ? 'invalid'
    : anyMissingContests
    ? 'incomplete'
    : undefined;
}
