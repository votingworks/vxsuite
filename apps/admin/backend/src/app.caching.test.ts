import { expect, MockInstance, test, vi } from 'vitest';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { Client } from '@votingworks/grout';
import { tmpNameSync } from 'tmp';
import { readFileSync } from 'node:fs';
import { assert, ok } from '@votingworks/basics';
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
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));
featureFlagMock.enableFeatureFlag(
  BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
);

async function getParsedExport({
  apiClient,
}: {
  apiClient: Client<Api>;
}): Promise<ReturnType<typeof parseCsv>> {
  const path = tmpNameSync();
  const exportResult = await apiClient.exportTallyReportCsv({
    path,
    filter: {},
    groupBy: {},
  });
  expect(exportResult).toEqual(ok(expect.anything()));
  return parseCsv(readFileSync(path, 'utf-8').toString());
}

// Previously getCastVoteRecords was only used to get all CVRs for tabulation,
// but now it is also used when reviewing write-ins to pull specific CVRs.
// We can filter out those calls as they have a non-null cvrId, and the
// remaining calls to get all CVRs are what the below test is interested in
function filterCallsWithoutCvrId(
  tabulationSpy: MockInstance
): Array<unknown[]> {
  return tabulationSpy.mock.calls.filter(([args]) => !args.cvrId);
}

test('uses and clears CVR tabulation cache appropriately', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;

  const { apiClient, auth, workspace } = buildTestEnvironment();
  const { store } = workspace;

  // The purpose of caching is to avoid reloading and re-tabulating the same
  // cast vote records repeatedly. We can use of the store's CVR accessor
  // as a proxy for whether results are tabulated from scratch.
  const tabulationSpy = vi.spyOn(store, 'getCastVoteRecords');

  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  const zeroExport = await getParsedExport({
    apiClient,
  });
  expect(filterCallsWithoutCvrId(tabulationSpy).length).toEqual(1);
  expect(zeroExport.rows.every((row) => row['Total Votes'] === '0')).toEqual(
    true
  );

  // adding a CVR file should should clear the cache
  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  expect(loadFileResult).toEqual(ok(expect.anything()));
  const resultsExport = await getParsedExport({
    apiClient,
  });
  expect(filterCallsWithoutCvrId(tabulationSpy).length).toEqual(2);
  expect(resultsExport).not.toEqual(zeroExport);

  // loading the same results should not trigger a tabulation
  const resultsExportFromCache = await getParsedExport({
    apiClient,
  });
  expect(filterCallsWithoutCvrId(tabulationSpy).length).toEqual(2);
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
  expect(filterCallsWithoutCvrId(tabulationSpy).length).toEqual(3);
  expect(doubledResultsExport).not.toEqual(resultsExport);

  // adjudicating a mark as a non-vote (by invalidating a write-in) should clear the cache
  const contestId = 'State-Representatives-Hillsborough-District-34-b1012d38';
  const [cvrId] = await apiClient.getAdjudicationQueue({ contestId });
  const [writeIn] = await apiClient.getWriteIns({ cvrId, contestId });
  assert(writeIn !== undefined);
  const { id: writeInId } = writeIn;
  await apiClient.adjudicateWriteIn({
    writeInId,
    type: 'invalid',
  });
  const resultsExportAfterAdjudication = await getParsedExport({
    apiClient,
  });
  expect(filterCallsWithoutCvrId(tabulationSpy).length).toEqual(4);
  expect(resultsExportAfterAdjudication).not.toEqual(doubledResultsExport);

  // adjudicating a mark as a vote (by un-invalidating a write-in) should clear the cache
  await apiClient.adjudicateWriteIn({
    writeInId,
    type: 'official-candidate',
    candidateId: 'Obadiah-Carrigan-5c95145a',
  });
  const resultsExportAfterReAdjudication = await getParsedExport({
    apiClient,
  });
  expect(filterCallsWithoutCvrId(tabulationSpy).length).toEqual(5);
  expect(resultsExportAfterReAdjudication).not.toEqual(
    resultsExportAfterAdjudication
  );

  // deleting CVR files should clear the cache
  await apiClient.clearCastVoteRecordFiles();
  const clearedResultsExport = await getParsedExport({
    apiClient,
  });
  expect(filterCallsWithoutCvrId(tabulationSpy).length).toEqual(6);
  expect(clearedResultsExport).toEqual(zeroExport);
});
