import {
  Id,
  Tabulation,
  Admin as AdminTypes,
  BallotStyleGroupId,
} from '@votingworks/types';
import { Store } from '../store';
import { ManualResultsVotingMethod } from '../types';

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
            // for temp-write-in candidates, create records and substitute ids
            const writeInCandidateRecord = store.addWriteInCandidate({
              electionId,
              contestId: contestResults.contestId,
              name: candidateTally.name,
            });
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
