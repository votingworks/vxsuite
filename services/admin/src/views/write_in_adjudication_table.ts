import { Admin } from '@votingworks/api';
import { CandidateContest } from '@votingworks/types';
import { collections, groupBy, take } from '@votingworks/utils';

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
      enabled: true,
    })),
  };
}

/**
 * Renders the group of options for write-in candidates, i.e. the write-in
 * candidates that have been adjudicated but are not official candidates.
 */
function renderWriteInCandidatesOptionGroup(
  forSummary: Admin.WriteInSummaryEntryNonPending,
  writeInSummaries: readonly Admin.WriteInSummaryEntryNonPending[]
): Admin.WriteInAdjudicationTableOptionGroup {
  return {
    title: 'Write-In Candidates',
    options: writeInSummaries.map((summary) => ({
      adjudicatedValue: summary.transcribedValue,
      enabled:
        forSummary === summary ||
        summary.status === 'transcribed' ||
        summary.writeInAdjudication.adjudicatedValue ===
          summary.transcribedValue,
    })),
  };
}

/**
 * Renders the data for the transcribed write-ins section of the adjudication
 * table, i.e. the write-ins that have been transcribed but not yet adjudicated.
 */
function renderTranscribedTableRowGroup(
  contest: CandidateContest,
  writeInSummaries: Admin.WriteInSummaryEntryNonPending[]
): Admin.WriteInAdjudicationTableTranscribedRowGroup {
  const transcribedWriteInSummaries = writeInSummaries.filter(
    (s): s is Admin.WriteInSummaryEntryTranscribed => s.status === 'transcribed'
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
        renderWriteInCandidatesOptionGroup(summary, writeInSummaries),
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
  writeInSummaries: Admin.WriteInSummaryEntryNonPending[]
): Admin.WriteInAdjudicationTableAdjudicatedRowGroup[] {
  const writeInSummariesByAdjudicatedValue = groupBy(
    writeInSummaries.filter(
      (s): s is Admin.WriteInSummaryEntryAdjudicated =>
        s.status === 'adjudicated'
    ),
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
              renderWriteInCandidatesOptionGroup(summary, writeInSummaries),
            ]),
            editable: writeInSummaries.every(
              (s) =>
                s === summary ||
                s.status !== 'adjudicated' ||
                s.writeInAdjudication.adjudicatedValue !==
                  summary.transcribedValue
            ),
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
  contest: CandidateContest,
  writeInSummaries: Admin.WriteInSummaryEntryNonPending[]
): Admin.WriteInAdjudicationTable {
  const transcribed = renderTranscribedTableRowGroup(contest, writeInSummaries);
  const adjudicated = renderAdjudicatedTableRowGroup(contest, writeInSummaries);

  const writeInCount = [...adjudicated, transcribed].reduce(
    (sum, group) => sum + group.writeInCount,
    0
  );

  return {
    contestId: contest.id,
    writeInCount,
    transcribed,
    adjudicated,
  };
}
