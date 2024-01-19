import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { Tabulation } from '@votingworks/types';
import { Client } from '@votingworks/grout';
import { tmpNameSync } from 'tmp';
import { readFileSync } from 'fs';
import { assert } from '@votingworks/basics';
import { modifyCastVoteRecordExport } from '@votingworks/backend';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import { parseCsv } from '../test/csv';
import { Api } from './app';

// enable us to use modified fixtures that don't pass authentication
const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', () => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});
featureFlagMock.enableFeatureFlag(
  BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
);

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

  // adding a CVR file should should clear the cache
  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');
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

  // adding another CVR file should should clear the cache again
  const loadFileAgainResult = await apiClient.addCastVoteRecordFile({
    path: await modifyCastVoteRecordExport(
      castVoteRecordExport.asDirectoryPath(),
      {
        castVoteRecordModifier: (castVoteRecord) => ({
          ...castVoteRecord,
          UniqueId: `${castVoteRecord.UniqueId}'`,
        }),
      }
    ),
  });
  loadFileAgainResult.assertOk('load file failed');
  const doubledResultsExport = await getParsedExport({
    apiClient,
  });
  expect(tabulationSpy).toHaveBeenCalledTimes(3);
  expect(doubledResultsExport).not.toEqual(resultsExport);

  // adjudicating a mark as a non-vote (by invalidating a write-in) should clear the cache
  const [writeInId] = await apiClient.getWriteInAdjudicationQueue({
    contestId: 'State-Representatives-Hillsborough-District-34-b1012d38',
  });
  assert(writeInId !== undefined);
  await apiClient.adjudicateWriteIn({
    writeInId,
    type: 'invalid',
  });
  const resultsExportAfterAdjudication = await getParsedExport({
    apiClient,
  });
  expect(tabulationSpy).toHaveBeenCalledTimes(4);
  expect(resultsExportAfterAdjudication).not.toEqual(doubledResultsExport);

  // adjudicating a mark a vote (by un-invalidating a write-in) should clear the cache
  await apiClient.adjudicateWriteIn({
    writeInId,
    type: 'official-candidate',
    candidateId: 'Obadiah-Carrigan-5c95145a',
  });
  const resultsExportAfterReAdjudication = await getParsedExport({
    apiClient,
  });
  expect(tabulationSpy).toHaveBeenCalledTimes(5);
  expect(resultsExportAfterReAdjudication).not.toEqual(
    resultsExportAfterAdjudication
  );

  // deleting CVR files should clear the cache
  await apiClient.clearCastVoteRecordFiles();
  const clearedResultsExport = await getParsedExport({
    apiClient,
  });
  expect(tabulationSpy).toHaveBeenCalledTimes(6);
  expect(clearedResultsExport).toEqual(zeroExport);
});
