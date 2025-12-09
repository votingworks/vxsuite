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
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import {
  exportElectionPackage,
  generateAllPrecinctsTallyReport,
  readFixture,
  testSetupHelpers,
  unzipElectionPackageAndBallots,
} from '../test/helpers';
import { jurisdictions, users, vxJurisdiction, vxUser } from '../test/mocks';
import { convertMsResults } from './convert_ms_results';

vi.setConfig({ testTimeout: 30_000 });

const { setupApp, cleanup } = testSetupHelpers();

afterAll(cleanup);

test('load MS SEMS election', async () => {
  const { apiClient, auth0 } = await setupApp({
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(vxUser);

  const electionId = unsafeParse(ElectionIdSchema, 'election-1');
  const result = await apiClient.loadElection({
    newId: electionId,
    jurisdictionId: vxJurisdiction.id,
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
  const { apiClient, auth0 } = await setupApp({
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(vxUser);

  const result = await apiClient.loadElection({
    newId: unsafeParse(ElectionIdSchema, 'election-2'),
    jurisdictionId: vxJurisdiction.id,
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
  const { apiClient, auth0, workspace, fileStorageClient } = await setupApp({
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(vxUser);

  // Load the election
  const electionId = unsafeParse(ElectionIdSchema, 'election-3');
  (
    await apiClient.loadElection({
      newId: electionId,
      jurisdictionId: vxJurisdiction.id,
      upload: {
        format: 'ms-sems',
        electionFileContents: readFixture('ms-sems-election-general-10.csv'),
        candidateFileContents: readFixture(
          'ms-sems-election-candidates-general-10.csv'
        ),
      },
    })
  ).unsafeUnwrap();

  // Can't convert before exporting
  expect(
    await apiClient.convertMsResults({
      electionId,
      allPrecinctsTallyReportContents: 'mock report contents',
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
    fileStorageClient.getRawFile(
      join(vxJurisdiction.id, electionPackageFilePath)
    )
  );
  const { electionPackageContents } =
    await unzipElectionPackageAndBallots(contents);
  const { electionPackage } = (
    await readElectionPackageFromBuffer(electionPackageContents)
  ).unsafeUnwrap();

  // Now conversion should work
  const allPrecinctsTallyReportContents = generateAllPrecinctsTallyReport(
    electionPackage.electionDefinition
  );
  const convertResult = (
    await apiClient.convertMsResults({
      electionId,
      allPrecinctsTallyReportContents,
    })
  ).unsafeUnwrap();
  expect(convertResult.convertedResults).toEqual(
    // Tested in convert_ms_results.test.ts
    convertMsResults(
      electionPackage.electionDefinition,
      allPrecinctsTallyReportContents
    ).unsafeUnwrap()
  );
  expect(convertResult.ballotHash).toEqual(
    formatBallotHash(electionPackage.electionDefinition.ballotHash)
  );

  // Expected conversion errors are returned
  const expectedErrorResult = await apiClient.convertMsResults({
    electionId,
    allPrecinctsTallyReportContents: 'invalid,report',
  });
  expect(expectedErrorResult).toEqual(err('wrong-tally-report'));

  const wrongElectionErrorResult = await apiClient.convertMsResults({
    electionId,
    allPrecinctsTallyReportContents: generateAllPrecinctsTallyReport(
      readElectionGeneralDefinition()
    ),
  });
  expect(wrongElectionErrorResult).toEqual(err('wrong-election'));

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
      `"Invalid Record Length: columns length is 7, got 1 on line 867"`
    );
  });
});
