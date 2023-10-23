import { Election, Tabulation } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { Readable } from 'stream';
import { getBallotCount, groupMapToGroupList } from '@votingworks/utils';
import { stringify } from 'csv-stringify/sync';
import { ScannerBatch } from '../types';

function generateHeaderRow(election: Election): string {
  const contestSelectionHeaders: string[] = [];
  for (const contest of election.contests) {
    let contestTitle = contest.title;
    if (contest.type === 'candidate' && contest.partyId) {
      const party = election.parties.find((p) => p.id === contest.partyId);
      if (party) {
        contestTitle = `${party.fullName} ${contestTitle}`;
      }
    }
    contestTitle = contestTitle.replace(/[^a-z0-9 _-]+/gi, ' ').trim();
    contestSelectionHeaders.push(`${contestTitle} - Ballots Cast`);
    contestSelectionHeaders.push(`${contestTitle} - Undervotes`);
    contestSelectionHeaders.push(`${contestTitle} - Overvotes`);
    if (contest.type === 'candidate') {
      for (const candidate of contest.candidates) {
        contestSelectionHeaders.push(`${contestTitle} - ${candidate.name}`);
      }
      if (contest.allowWriteIns) {
        contestSelectionHeaders.push(`${contestTitle} - Write In`);
      }
    } else if (contest.type === 'yesno') {
      contestSelectionHeaders.push(`${contestTitle} - Yes`);
      contestSelectionHeaders.push(`${contestTitle} - No`);
    }
  }
  const headers = [
    'Batch ID',
    'Batch Name',
    'Tabulator',
    'Number of Ballots',
    ...contestSelectionHeaders,
  ];

  // use quotes for all headers that contain a dash i.e. the contest selection headers
  return stringify([headers], { quoted_match: /-/ });
}

function generateResultsRow(
  batchMetadata: ScannerBatch,
  batchResults: Tabulation.ElectionResults,
  election: Election
): string {
  const contestVoteTotals: string[] = [];
  for (const contest of election.contests) {
    const contestResults = batchResults.contestResults[contest.id];
    assert(contestResults);
    contestVoteTotals.push(contestResults.ballots.toString());
    contestVoteTotals.push(contestResults.undervotes.toString());
    contestVoteTotals.push(contestResults.overvotes.toString());
    if (contest.type === 'candidate') {
      assert(contestResults.contestType === 'candidate');
      for (const candidate of contest.candidates) {
        contestVoteTotals.push(
          /* c8 ignore next - trivial fallback case */
          contestResults.tallies[candidate.id]?.tally.toString() ?? '0'
        );
      }
      if (contest.allowWriteIns) {
        contestVoteTotals.push(
          /* c8 ignore start - trivial fallback case */
          contestResults.tallies[
            Tabulation.GENERIC_WRITE_IN_ID
          ]?.tally.toString() ?? '0'
          /* c8 ignore end */
        );
      }
    } else if (contest.type === 'yesno') {
      assert(contestResults.contestType === 'yesno');
      contestVoteTotals.push(contestResults.yesTally.toString());
      contestVoteTotals.push(contestResults.noTally.toString());
    }
  }
  const row = [
    batchMetadata.batchId,
    batchMetadata.label,
    batchMetadata.scannerId,
    getBallotCount(batchResults.cardCounts),
    ...contestVoteTotals,
  ];
  return stringify([row]);
}

/**
 * Generates a CSV file of election results broken down by scanning batch. Returns the
 * file as a readable stream.
 *
 * CSV File format:
 * One row for every batch, in addition to a headers row.
 * Columns for every possible contest selection in every contest.
 * | Batch ID | Batch Name | Tabulator | Number Of Ballots | Contest 1 - Ballots Cast | Contest 1 - Undervotes | Contest 1 - Overvotes | Contest 1 - Selection Option 1 | ... | Contest N - Selection Option M |
 */
export function generateBatchResultsFile({
  election,
  batchGroupedResults,
  allBatchMetadata,
}: {
  election: Election;
  batchGroupedResults: Tabulation.ElectionResultsGroupMap;
  allBatchMetadata: ScannerBatch[];
}): NodeJS.ReadableStream {
  const electionResultsList = groupMapToGroupList(batchGroupedResults);
  const batchMetadataLookup: Record<string, ScannerBatch> = {};
  for (const batchMetadata of allBatchMetadata) {
    batchMetadataLookup[batchMetadata.batchId] = batchMetadata;
  }

  function* generateBatchResultsFileRows() {
    yield generateHeaderRow(election);

    for (const batchResults of electionResultsList) {
      // expect batch results to be grouped by batchId
      assert(batchResults.batchId !== undefined);

      // every batch with results should have a batch in the database
      const batchMetadata = batchMetadataLookup[batchResults.batchId];
      assert(batchMetadata);

      yield generateResultsRow(batchMetadata, batchResults, election);
    }
  }

  return Readable.from(generateBatchResultsFileRows());
}
