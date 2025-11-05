import { vi, afterAll, expect, test } from 'vitest';
import {
  ElectionIdSchema,
  formatBallotHash,
  HmpbBallotPaperSize,
  unsafeParse,
} from '@votingworks/types';
import { assertDefined, err, ok } from '@votingworks/basics';
import { join } from 'node:path';
import { readElectionPackageFromBuffer } from '@votingworks/backend';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import {
  exportElectionPackage,
  generateAllPrecinctsTallyReport,
  readFixture,
  testSetupHelpers,
  unzipElectionPackageAndBallots,
} from '../test/helpers';
import { orgs, vxUser } from '../test/mocks';
import { convertMsResults } from './convert_ms_results';

vi.setConfig({ testTimeout: 30_000 });

const { setupApp, cleanup } = testSetupHelpers();

afterAll(cleanup);

test('load MS SEMS election', async () => {
  const { apiClient, auth0 } = await setupApp(orgs);
  auth0.setLoggedInUser(vxUser);

  const electionId = unsafeParse(ElectionIdSchema, 'election-1');
  const result = await apiClient.loadElection({
    newId: electionId,
    orgId: vxUser.orgId,
    upload: {
      format: 'ms-sems',
      electionFileContents: readFixture('ms-sems-election-general-10.csv'),
      candidateFileContents: readFixture(
        'ms-sems-election-candidates-general-10.csv'
      ),
    },
  });
  expect(result).toEqual(ok(electionId));
});

test('returns errors when loading invalid MS SEMS election', async () => {
  const { apiClient, auth0 } = await setupApp(orgs);
  auth0.setLoggedInUser(vxUser);

  const result = await apiClient.loadElection({
    newId: unsafeParse(ElectionIdSchema, 'election-2'),
    orgId: vxUser.orgId,
    upload: {
      format: 'ms-sems',
      // Corrupt the election file by truncating it prematurely
      electionFileContents: readFixture(
        'ms-sems-election-general-10.csv'
      ).substring(0, 50),
      candidateFileContents: readFixture(
        'ms-sems-election-candidates-general-10.csv'
      ),
    },
  });
  expect(result.err()).toMatchInlineSnapshot(
    `[Error: Quote Not Closed: the parsing is finished with an opening quote at line 2]`
  );
});

test('convert MS results', async () => {
  const { apiClient, auth0, workspace, fileStorageClient } =
    await setupApp(orgs);
  auth0.setLoggedInUser(vxUser);

  // Load the election
  const electionId = unsafeParse(ElectionIdSchema, 'election-3');
  (
    await apiClient.loadElection({
      newId: electionId,
      orgId: vxUser.orgId,
      upload: {
        format: 'ms-sems',
        electionFileContents: readFixture('ms-sems-election-general-10.csv'),
        candidateFileContents: readFixture(
          'ms-sems-election-candidates-general-10.csv'
        ),
      },
    })
  ).unsafeUnwrap();

  const { election } = await workspace.store.getElection(electionId);
  const allPrecinctsTallyReportContents =
    generateAllPrecinctsTallyReport(election);

  // Can't convert before exporting
  expect(
    await apiClient.convertMsResults({
      electionId,
      allPrecinctsTallyReportContents,
    })
  ).toEqual(err('no-election-export-found'));

  // Export the election
  await apiClient.updateBallotLayoutSettings({
    electionId,
    paperSize: HmpbBallotPaperSize.Legal,
    compact: true,
  });
  const electionPackageFilePath = await exportElectionPackage({
    apiClient,
    workspace,
    fileStorageClient,
    electionId,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: false,
  });
  const contents = assertDefined(
    fileStorageClient.getRawFile(join(vxUser.orgId, electionPackageFilePath))
  );
  const { electionPackageContents } =
    await unzipElectionPackageAndBallots(contents);
  const { electionPackage } = (
    await readElectionPackageFromBuffer(electionPackageContents)
  ).unsafeUnwrap();

  // Now conversion should work
  const convertResult = (
    await apiClient.convertMsResults({
      electionId,
      allPrecinctsTallyReportContents,
    })
  ).unsafeUnwrap();
  expect(convertResult.convertedResults).toEqual(
    // Tested in convert_ms_results.test.ts
    convertMsResults(election, allPrecinctsTallyReportContents).unsafeUnwrap()
  );
  expect(convertResult.ballotHash).toEqual(
    formatBallotHash(electionPackage.electionDefinition.ballotHash)
  );

  // Expected conversion errors are returned
  const expectedErrorResult = await apiClient.convertMsResults({
    electionId,
    allPrecinctsTallyReportContents: 'wrong,headers,csv',
  });
  expect(expectedErrorResult).toEqual(err('invalid-headers'));

  // Unexpected conversion errors are wrapped so the frontend can show them
  // rather than crash
  await suppressingConsoleOutput(async () => {
    const unexpectedErrorResult = await apiClient.convertMsResults({
      electionId,
      allPrecinctsTallyReportContents: `${allPrecinctsTallyReportContents}\nextra line`,
    });
    expect(unexpectedErrorResult.err()).toBeInstanceOf(Error);
    expect(
      (unexpectedErrorResult.err() as Error).message
    ).toMatchInlineSnapshot(
      `"Invalid Record Length: columns length is 7, got 1 on line 866"`
    );
  });
});
