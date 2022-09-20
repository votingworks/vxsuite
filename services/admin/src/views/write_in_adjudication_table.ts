import { Admin } from '@votingworks/api';
import { CandidateContest } from '@votingworks/types';
import { collections, groupBy, take } from '@votingworks/utils';
import { Store } from '../store';

/**
 * Sorts the adjudication options by the adjudicated value.
 */
function sortAdjudicationOptions(
  options: Iterable<Admin.WriteInAdjudicationTableOption>
): Admin.WriteInAdjudicationTableOption[] {
  return [...options].sort((a, b) =>
    a.adjudicatedValue.localeCompare(b.adjudicatedValue)
  );
}

/**
 * Normalizes the adjudication option groups for display.
 */
function normalizeAdjudicationOptionGroups(
  adjudicationOptionGroups: Iterable<Admin.WriteInAdjudicationTableOptionGroup>
): Admin.WriteInAdjudicationTableOptionGroup[] {
  return [...adjudicationOptionGroups]
    .filter((group) => group.options.length > 0)
    .map((group) => ({
      ...group,
      options: sortAdjudicationOptions(group.options),
    }));
}

/**
 * Renders the group of options for official candidates, i.e. the candidates
 * that are already on the ballot.
 */
function renderOfficialCandidatesOptionGroup(
  contest: CandidateContest
): Admin.WriteInAdjudicationTableOptionGroup {
  return {
    title: 'Official Candidates',
    options: contest.candidates.map((candidate) => ({
      adjudicatedValue: candidate.name,
      adjudicatedOptionId: candidate.id,
    })),
  };
}

/**
 * Renders the group of options for write-in candidates, i.e. the write-in
 * candidates that have been adjudicated but are not official candidates.
 */
function renderWriteInCandidatesOptionGroup(
  adjudicatedWriteInSummaries: readonly Admin.WriteInSummaryEntryAdjudicated[]
): Admin.WriteInAdjudicationTableOptionGroup {
  return {
    title: 'Write-In Candidates',
    options: Array.from(
      new Set(
        adjudicatedWriteInSummaries
          .filter((s) => !s.writeInAdjudication.adjudicatedOptionId)
          .map((s) => s.writeInAdjudication.adjudicatedValue)
      ),
      (adjudicatedValue) => ({ adjudicatedValue })
    ),
  };
}

/**
 * Renders the data for the transcribed write-ins section of the adjudication
 * table, i.e. the write-ins that have been transcribed but not yet adjudicated.
 */
function renderTranscribedTableRowGroup(
  contest: CandidateContest,
  writeInSummaries: readonly Admin.WriteInSummaryEntry[]
): Admin.WriteInAdjudicationTableTranscribedRowGroup {
  const transcribedWriteInSummaries = writeInSummaries.filter(
    (s): s is Admin.WriteInSummaryEntryTranscribed => s.status === 'transcribed'
  );
  const adjudicatedWriteInSummaries = writeInSummaries.filter(
    (s): s is Admin.WriteInSummaryEntryAdjudicated => s.status === 'adjudicated'
  );
  const writeInCount = transcribedWriteInSummaries.reduce(
    (sum, s) => sum + s.writeInCount,
    0
  );

  return {
    writeInCount,
    rows: transcribedWriteInSummaries.map((summary) => ({
      transcribedValue: summary.transcribedValue,
      writeInCount: summary.writeInCount,
      adjudicationOptionGroups: normalizeAdjudicationOptionGroups([
        renderOfficialCandidatesOptionGroup(contest),
        renderWriteInCandidatesOptionGroup(adjudicatedWriteInSummaries),
        {
          title: 'Original Transcription',
          options: [{ adjudicatedValue: summary.transcribedValue }],
        },
      ]),
    })),
  };
}

/**
 * Renders the data for the adjudicated write-ins section of the adjudication
 * table, i.e. the write-ins that have already been adjudicated.
 */
function renderAdjudicatedTableRowGroup(
  contest: CandidateContest,
  writeInSummaries: readonly Admin.WriteInSummaryEntryAdjudicated[]
): Admin.WriteInAdjudicationTableAdjudicatedRowGroup[] {
  const adjudicatedWriteInSummaries = writeInSummaries.filter(
    (s): s is Admin.WriteInSummaryEntryAdjudicated => s.status === 'adjudicated'
  );

  const writeInSummariesByAdjudicatedValue = groupBy(
    writeInSummaries,
    (s) => s.writeInAdjudication.adjudicatedValue
  );

  return Array.from(
    writeInSummariesByAdjudicatedValue,
    ([adjudicatedValue, summaries]) => {
      const writeInCount = collections.reduce(
        summaries,
        (sum, s) => sum + s.writeInCount,
        0
      );
      const firstSummary = take(
        1,
        summaries
      )[0] as Admin.WriteInSummaryEntryAdjudicated;
      const { adjudicatedOptionId } = firstSummary.writeInAdjudication;

      return {
        adjudicatedValue,
        adjudicatedOptionId,
        writeInCount,
        rows: Array.from(
          summaries,
          (summary): Admin.WriteInAdjudicationTableAdjudicatedRow => ({
            transcribedValue: summary.transcribedValue,
            writeInCount: summary.writeInCount,
            writeInAdjudicationId: summary.writeInAdjudication.id,
            adjudicationOptionGroups: normalizeAdjudicationOptionGroups([
              renderOfficialCandidatesOptionGroup(contest),
              renderWriteInCandidatesOptionGroup(
                adjudicatedWriteInSummaries.filter(
                  (s) => s.transcribedValue !== summary.transcribedValue
                )
              ),
              {
                title: 'Original Transcription',
                options: [{ adjudicatedValue: summary.transcribedValue }],
              },
            ]),
          })
        ),
      };
    }
  );
}

/**
 * Renders the write-in adjudication table view.
 */
export function render(
  store: Store,
  { electionId, contestId }: Admin.GetWriteInAdjudicationTableUrlParams
): Admin.WriteInAdjudicationTable | undefined {
  const electionRecord = store.getElection(electionId);

  if (!electionRecord) {
    return undefined;
  }

  const contest = electionRecord.electionDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate' && c.id === contestId
  );

  if (!contest) {
    return undefined;
  }

  const writeInSummaries = store.getWriteInAdjudicationSummary({
    electionId,
    contestId,
  });

  const transcribed = renderTranscribedTableRowGroup(contest, writeInSummaries);
  const adjudicated = renderAdjudicatedTableRowGroup(
    contest,
    writeInSummaries.filter(
      (s): s is Admin.WriteInSummaryEntryAdjudicated =>
        s.status === 'adjudicated'
    )
  );

  const writeInCount = [...adjudicated, transcribed].reduce(
    (sum, group) => sum + group.writeInCount,
    0
  );

  return {
    contestId,
    writeInCount,
    transcribed,
    adjudicated,
  };
}
