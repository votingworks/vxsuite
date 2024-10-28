import {
  getCastVoteRecordExportDirectoryPaths,
  mockElectionPackageFileTree,
  readCastVoteRecordExport,
} from '@votingworks/backend';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { CVR } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  convertCastVoteRecordVotesToTabulationVotes,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { ok, sleep } from '@votingworks/basics';
import { withApp } from '../test/helpers/setup_app';
import { mockElectionManagerAuth } from '../test/helpers/auth';
import { generateBmdBallotFixture } from '../test/helpers/ballots';
import { ScannedSheetInfo } from './fujitsu_scanner';

// we need more time for ballot interpretation
jest.setTimeout(20000);

const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', () => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});

test('going through the whole process works - BMD', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  await withApp(
    async ({ apiClient, auth, scanner, importer, mockUsbDrive }) => {
      mockElectionManagerAuth(auth, electionDefinition);
      mockUsbDrive.insertUsbDrive(
        await mockElectionPackageFileTree(
          electionFamousNames2021Fixtures.electionJson.toElectionPackage()
        )
      );
      const configureResult =
        await apiClient.configureFromElectionPackageOnUsbDrive();
      expect(configureResult.isOk()).toEqual(true);
      expect(configureResult.ok()).toEqual(electionDefinition);
      mockUsbDrive.removeUsbDrive();

      await apiClient.setTestMode({ testMode: true });

      const ballot = await generateBmdBallotFixture();
      const scannedBallot: ScannedSheetInfo = {
        frontPath: ballot[0],
        backPath: ballot[1],
      };
      {
        // define the next scanner session & scan some sample ballots
        scanner.withNextScannerSession().sheet(scannedBallot).end();
        await apiClient.scanBatch();

        await importer.waitForEndOfBatchOrScanningPause();

        // check the status
        const status = await apiClient.getStatus();

        expect(status.batches[0].count).toEqual(1);
      }

      {
        mockUsbDrive.insertUsbDrive({});
        mockUsbDrive.usbDrive.sync.expectRepeatedCallsWith().resolves();

        expect(
          await apiClient.exportCastVoteRecordsToUsbDrive({
            isMinimalExport: true,
          })
        ).toEqual(ok());

        // Sleep 1 second to guarantee that this next export directory has a different name than the
        // previously created one
        await sleep(1000);
        expect(
          await apiClient.exportCastVoteRecordsToUsbDrive({
            isMinimalExport: false,
          })
        ).toEqual(ok());

        const cvrReportDirectoryPath = (
          await getCastVoteRecordExportDirectoryPaths(mockUsbDrive.usbDrive)
        )[0];
        expect(cvrReportDirectoryPath).toContain('TEST__machine_0000__');

        const { castVoteRecordIterator } = (
          await readCastVoteRecordExport(cvrReportDirectoryPath)
        ).unsafeUnwrap();
        const cvrs: CVR.CVR[] = (await castVoteRecordIterator.toArray()).map(
          (castVoteRecordResult) =>
            castVoteRecordResult.unsafeUnwrap().castVoteRecord
        );
        expect(
          cvrs.map((cvr) =>
            convertCastVoteRecordVotesToTabulationVotes(cvr.CVRSnapshot[0])
          )
        ).toEqual([
          expect.objectContaining({
            mayor: ['sherlock-holmes'],
            controller: ['winston-churchill'],
          }),
        ]);
      }

      {
        // delete all batches
        const status = await apiClient.getStatus();
        for (const { id } of status.batches) {
          await apiClient.deleteBatch({ batchId: id });
        }
      }

      {
        // expect that we have no batches
        const status = await apiClient.getStatus();

        expect(status.batches).toEqual([]);
      }

      // Sleep 1 second to guarantee that this next export directory has a different name than the
      // previously created one
      await sleep(1000);
      expect(
        await apiClient.exportCastVoteRecordsToUsbDrive({
          isMinimalExport: true,
        })
      ).toEqual(ok());

      const cvrReportDirectoryPaths =
        await getCastVoteRecordExportDirectoryPaths(mockUsbDrive.usbDrive);
      expect(cvrReportDirectoryPaths).toHaveLength(3);
      const cvrReportDirectoryPath = cvrReportDirectoryPaths[2];
      const { castVoteRecordIterator } = (
        await readCastVoteRecordExport(cvrReportDirectoryPath)
      ).unsafeUnwrap();

      // there should be no CVRs in the file.
      expect(await castVoteRecordIterator.count()).toEqual(0);

      // clean up
      await apiClient.unconfigure();
    }
  );
});
