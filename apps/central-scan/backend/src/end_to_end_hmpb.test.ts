import {
  getCastVoteRecordExportDirectoryPaths,
  isTestReport,
  mockElectionPackageFileTree,
  readCastVoteRecordExport,
} from '@votingworks/backend';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { BallotType, CVR, DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  convertCastVoteRecordVotesToTabulationVotes,
  getCastVoteRecordBallotType,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { ok } from '@votingworks/basics';
import { withApp } from '../test/helpers/setup_app';
import { mockElectionManagerAuth } from '../test/helpers/auth';

// we need more time for ballot interpretation
jest.setTimeout(20000);

// mock SKIP_SCAN_ELECTION_HASH_CHECK to allow us to use old ballot image fixtures
const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', () => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});

test('going through the whole process works - HMPB', async () => {
  // sample ballot election hash does not match election hash for this test
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_SCAN_ELECTION_HASH_CHECK
  );

  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  await withApp(
    async ({ apiClient, auth, scanner, importer, mockUsbDrive }) => {
      const { electionDefinition } =
        electionGridLayoutNewHampshireTestBallotFixtures;

      mockElectionManagerAuth(auth, electionDefinition);
      mockUsbDrive.insertUsbDrive(
        await mockElectionPackageFileTree(
          electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(
            {
              ...DEFAULT_SYSTEM_SETTINGS,
              markThresholds: {
                definite: 0.08,
                marginal: 0.05,
              },
            }
          )
        )
      );
      const configureResult =
        await apiClient.configureFromElectionPackageOnUsbDrive();
      expect(configureResult.isOk()).toEqual(true);
      expect(configureResult.ok()).toEqual(electionDefinition);
      mockUsbDrive.removeUsbDrive();

      await apiClient.setTestMode({ testMode: false });

      {
        // define the next scanner session
        const nextSession = scanner.withNextScannerSession();

        // scan some sample ballots
        nextSession.sheet({
          frontPath:
            electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedFront.asFilePath(),
          backPath:
            electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedBack.asFilePath(),
        });

        nextSession.end();

        await apiClient.scanBatch();
        await importer.waitForEndOfBatchOrScanningPause();

        // check the latest batch has the expected counts
        const status = await apiClient.getStatus();
        expect(status.batches.length).toEqual(1);
        expect(status.batches[0].count).toEqual(1);
      }

      {
        mockUsbDrive.insertUsbDrive({});

        expect(
          await apiClient.exportCastVoteRecordsToUsbDrive({
            isMinimalExport: true,
          })
        ).toEqual(ok());

        const cvrReportDirectoryPath = (
          await getCastVoteRecordExportDirectoryPaths(mockUsbDrive.usbDrive)
        )[0];
        expect(cvrReportDirectoryPath).toContain('machine_000__');

        const { castVoteRecordExportMetadata, castVoteRecordIterator } = (
          await readCastVoteRecordExport(cvrReportDirectoryPath)
        ).unsafeUnwrap();
        const cvrs: CVR.CVR[] = (await castVoteRecordIterator.toArray()).map(
          (castVoteRecordResult) =>
            castVoteRecordResult.unsafeUnwrap().castVoteRecord
        );
        expect(cvrs).toHaveLength(1);
        const [cvr] = cvrs;
        expect(
          isTestReport(
            castVoteRecordExportMetadata.castVoteRecordReportMetadata
          )
        ).toBeFalsy();
        expect(cvr.BallotStyleId).toEqual('card-number-3');
        expect(cvr.BallotStyleUnitId).toEqual('town-id-00701-precinct-id-');
        expect(cvr.CreatingDeviceId).toEqual('000');
        expect(cvr.BallotSheetId).toEqual('1');
        expect(getCastVoteRecordBallotType(cvr)).toEqual(BallotType.Precinct);
        expect(convertCastVoteRecordVotesToTabulationVotes(cvr.CVRSnapshot[0]))
          .toMatchInlineSnapshot(`
      {
        "County-Attorney-133f910f": [
          "Mary-Woolson-dc0b854a",
        ],
        "County-Commissioner-d6feed25": [
          "write-in-0",
        ],
        "County-Treasurer-87d25a31": [
          "write-in-0",
        ],
        "Executive-Councilor-bb22557f": [
          "write-in-0",
        ],
        "Governor-061a401b": [
          "Josiah-Bartlett-1bb99985",
        ],
        "Register-of-Deeds-a1278df2": [
          "John-Mann-b56bbdd3",
        ],
        "Register-of-Probate-a4117da8": [
          "Claire-Cutts-07a436e7",
        ],
        "Representative-in-Congress-24683b44": [
          "Richard-Coote-b9095636",
        ],
        "Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc": [
          "Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc-option-yes",
        ],
        "Sheriff-4243fe0b": [
          "Edward-Randolph-bf4c848a",
        ],
        "State-Representative-Hillsborough-District-37-f3bde894": [
          "Charles-H-Hersey-096286a4",
        ],
        "State-Representatives-Hillsborough-District-34-b1012d38": [
          "Samuel-Bell-17973275",
          "Samuel-Livermore-f927fef1",
          "Jacob-Freese-b5146505",
        ],
        "State-Senator-391381f8": [
          "James-Poole-db5ef4bd",
        ],
        "United-States-Senator-d3f1c75b": [
          "William-Preston-3778fcd5",
        ],
      }
    `);
      }
    }
  );
});
