import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { Tabulation } from '@votingworks/types';
import { Client } from '@votingworks/grout';
import { tmpNameSync } from 'tmp';
import { readFileSync } from 'fs';
import { assert } from '@votingworks/basics';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import { parseCsv } from '../test/csv';
import { Api } from './app';

async function getParsedExport({
  apiClient,
  groupBy,
  filter,
}: {
  apiClient: Client<Api>;
  groupBy?: Tabulation.GroupBy;
  filter?: Tabulation.Filter;
}): Promise<ReturnType<typeof parseCsv>> {
  const path = tmpNameSync();
  const exportResult = await apiClient.exportTallyReportCsv({
    path,
    groupBy,
    filter,
  });
  expect(exportResult.isOk()).toEqual(true);
  return parseCsv(readFileSync(path, 'utf-8').toString());
}

it('uses and clears CVR tabulation cache appropriately', async () => {
  const { electionDefinition, castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;

  const { apiClient, auth, workspace } = buildTestEnvironment();
  const { store } = workspace;

  // The purpose of caching is to avoid reloading and re-tabulating the same
  // cast vote records repeatedly. We can use of the store's CVR accessor
  // as a proxy for whether results are tabulated from scratch.
  const tabulationSpy = jest.spyOn(store, 'getCastVoteRecords');

  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const zeroExport = await getParsedExport({
    apiClient,
  });
  expect(tabulationSpy).toHaveBeenCalledTimes(1);
  expect(zeroExport.rows.every((row) => row['Total Votes'] === '0')).toEqual(
    true
  );

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  // the cache should be cleared when a new file is loaded
  const resultsExport = await getParsedExport({
    apiClient,
  });
  expect(tabulationSpy).toHaveBeenCalledTimes(2);
  expect(resultsExport).not.toEqual(zeroExport);

  // loading the same results should not trigger a tabulation
  const resultsExportFromCache = await getParsedExport({
    apiClient,
  });
  expect(tabulationSpy).toHaveBeenCalledTimes(2);
  expect(resultsExportFromCache).toEqual(resultsExport);

  // different report parameters should be tabulated separately
  const resultsExportByVotingMethod = await getParsedExport({
    apiClient,
    groupBy: { groupByVotingMethod: true },
  });
  expect(tabulationSpy).toHaveBeenCalledTimes(3);
  expect(resultsExportByVotingMethod).not.toEqual(resultsExport);

  // write-in adjudication should clear the cache
  const [writeInId] = await apiClient.getWriteInAdjudicationQueue();
  assert(writeInId !== undefined);
  await apiClient.adjudicateWriteIn({
    writeInId,
    type: 'invalid',
  });
  const resultsExportAfterAdjudication = await getParsedExport({
    apiClient,
  });
  expect(tabulationSpy).toHaveBeenCalledTimes(4);
  expect(resultsExportAfterAdjudication).not.toEqual(resultsExport);

  // clearing CVR files should clear the cache
  await apiClient.clearCastVoteRecordFiles();
  const clearedResultsExport = await getParsedExport({
    apiClient,
  });
  expect(tabulationSpy).toHaveBeenCalledTimes(5);
  expect(clearedResultsExport).toEqual(zeroExport);
});
