import { Id, Tabulation } from '@votingworks/types';
import { TEMPORARY_WRITE_IN_ID_PREFIX } from '@votingworks/types/src/admin';
import { Store } from '../store';

/**
 * The manual results entry form allows creating new write-in candidates. These
 * are included in the manual results from the frontend prefaced by
 * `temp-write-in-`. This method creates the new write-in candidates in the
 * database, substitutes the ids in the passed `ManualElectionResults`, and strips out
 * any write-in references with zero votes. Edits the `ManualElectionResults` in place.
 */
export function handleEnteredWriteInCandidateData({
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
          } else if (candidateId.startsWith(TEMPORARY_WRITE_IN_ID_PREFIX)) {
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
