import {
  getCastVoteRecordExportDirectoryPaths,
  mockElectionPackageFileTree,
  readCastVoteRecordExport,
} from '@votingworks/backend';
import { ok, sleep } from '@votingworks/basics';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { CVR } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  convertCastVoteRecordVotesToTabulationVotes,
  getFeatureFlagMock,
} from '@votingworks/utils';
import * as fsExtra from 'fs-extra';
import { expect, test, vi } from 'vitest';
import { mockElectionManagerAuth } from '../test/helpers/auth';
import { generateBmdBallotFixture } from '../test/helpers/ballots';
import { withApp } from '../test/helpers/setup_app';
import { ScannedSheetInfo } from './fujitsu_scanner';

// we need more time for ballot interpretation
vi.setConfig({
  testTimeout: 20000,
});

const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

test('going through the whole process works - BMD', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  await withApp(
    async ({ apiClient, auth, scanner, importer, mockUsbDrive, workspace }) => {
      mockElectionManagerAuth(auth, electionDefinition);
      mockUsbDrive.insertUsbDrive(
        await mockElectionPackageFileTree(
          electionFamousNames2021Fixtures.electionJson.toElectionPackage()
        )
      );
      expect(await apiClient.configureFromElectionPackageOnUsbDrive()).toEqual(
        ok(electionDefinition)
      );
      mockUsbDrive.removeUsbDrive();

      await apiClient.setTestMode({ testMode: true });

      const bmdFixture = await generateBmdBallotFixture();
      const scannedBallot: ScannedSheetInfo = {
        frontPath: bmdFixture.sheet[0],
        backPath: bmdFixture.sheet[1],
      };
      {
        // define the next scanner session & scan some sample ballots
        scanner.withNextScannerSession().sheet(scannedBallot).end();
        await apiClient.scanBatch();

        await importer.waitForEndOfBatchOrScanningPause();

        // check the status
        const status = await apiClient.getStatus();

        expect(status.batches[0].count).toEqual(1);

        const ballotImagesPathEntries = await fsExtra.readdir(
          workspace.ballotImagesPath,
          { recursive: true, withFileTypes: true }
        );
        expect(ballotImagesPathEntries).toHaveLength(2);
        for (const entry of ballotImagesPathEntries) {
          expect(entry.isFile()).toEqual(true);
          expect(entry.name).toMatch(/.*\.png$/);
        }
      }

      {
        mockUsbDrive.insertUsbDrive({});
        mockUsbDrive.usbDrive.sync.expectRepeatedCallsWith().resolves();

        expect(await apiClient.exportCastVoteRecordsToUsbDrive()).toEqual(ok());

        // Sleep 1 second to guarantee that this next export directory has a different name than the
        // previously created one
        await sleep(1000);
        expect(await apiClient.exportCastVoteRecordsToUsbDrive()).toEqual(ok());

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
      expect(await apiClient.exportCastVoteRecordsToUsbDrive()).toEqual(ok());

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

      const ballotImagesPathEntries = await fsExtra.readdir(
        workspace.ballotImagesPath,
        { recursive: true }
      );
      expect(ballotImagesPathEntries).toHaveLength(0);
    }
  );
});
