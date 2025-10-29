import {
  getCastVoteRecordExportDirectoryPaths,
  isTestReport,
  mockElectionPackageFileTree,
  readCastVoteRecordExport,
} from '@votingworks/backend';
import { iter, ok } from '@votingworks/basics';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { pdfToImages, writeImageData } from '@votingworks/image-utils';
import {
  asSheet,
  BallotType,
  CVR,
  DEFAULT_SYSTEM_SETTINGS,
  DEV_MACHINE_ID,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  convertCastVoteRecordVotesToTabulationVotes,
  getCastVoteRecordBallotType,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { readFile } from 'node:fs/promises';
import { makeTemporaryFile } from '@votingworks/fixtures';
import { expect, test, vi } from 'vitest';
import { mockElectionManagerAuth } from '../test/helpers/auth';
import { withApp } from '../test/helpers/setup_app';

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

test('going through the whole process works - HMPB', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  await withApp(
    async ({ apiClient, auth, scanner, importer, mockUsbDrive }) => {
      const { electionDefinition } = vxFamousNamesFixtures;

      mockElectionManagerAuth(auth, electionDefinition);
      mockUsbDrive.insertUsbDrive(
        await mockElectionPackageFileTree({
          electionDefinition: vxFamousNamesFixtures.electionDefinition,
          systemSettings: {
            ...DEFAULT_SYSTEM_SETTINGS,
            markThresholds: {
              definite: 0.08,
              marginal: 0.05,
            },
          },
        })
      );
      expect(await apiClient.configureFromElectionPackageOnUsbDrive()).toEqual(
        ok(electionDefinition)
      );
      mockUsbDrive.removeUsbDrive();

      await apiClient.setTestMode({ testMode: true });

      {
        // define the next scanner session
        const nextSession = scanner.withNextScannerSession();

        // scan some sample ballots
        const [frontImageData, backImageData] = asSheet(
          await iter(
            pdfToImages(
              Uint8Array.from(
                await readFile(vxFamousNamesFixtures.blankBallotPath)
              ),
              { scale: 200 / 72 }
            )
          )
            .map(({ page }) => page)
            .toArray()
        );
        const frontPath = makeTemporaryFile();
        const backPath = makeTemporaryFile();
        await writeImageData(frontPath, frontImageData);
        await writeImageData(backPath, backImageData);
        nextSession.sheet({
          frontPath,
          backPath,
          ballotAuditId: 'fake-ballot-audit-id',
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
        mockUsbDrive.usbDrive.sync.expectRepeatedCallsWith().resolves();

        expect(await apiClient.exportCastVoteRecordsToUsbDrive()).toEqual(ok());

        const cvrReportDirectoryPath = (
          await getCastVoteRecordExportDirectoryPaths(mockUsbDrive.usbDrive)
        )[0];
        expect(cvrReportDirectoryPath).toContain('machine_0000__');

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
        ).toBeTruthy();
        expect(cvr.BallotStyleId).toEqual('1-1');
        expect(cvr.BallotStyleUnitId).toEqual('20');
        expect(cvr.CreatingDeviceId).toEqual(DEV_MACHINE_ID);
        expect(cvr.BallotSheetId).toEqual('1');
        expect(cvr.BallotAuditId).toEqual('fake-ballot-audit-id');
        expect(getCastVoteRecordBallotType(cvr)).toEqual(BallotType.Precinct);
        expect(convertCastVoteRecordVotesToTabulationVotes(cvr.CVRSnapshot[0]))
          .toMatchInlineSnapshot(`
            {
              "attorney": [],
              "board-of-alderman": [],
              "chief-of-police": [],
              "city-council": [],
              "controller": [],
              "mayor": [],
              "parks-and-recreation-director": [],
              "public-works-director": [],
            }
          `);
      }
    }
  );
});

test('ballots printed with invalid scale are rejected', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  await withApp(
    async ({ apiClient, auth, scanner, importer, mockUsbDrive }) => {
      const { electionDefinition } = vxFamousNamesFixtures;

      mockElectionManagerAuth(auth, electionDefinition);
      const minimumDetectedBallotScaleOverride = 1.0;
      mockUsbDrive.insertUsbDrive(
        await mockElectionPackageFileTree({
          electionDefinition: vxFamousNamesFixtures.electionDefinition,
          systemSettings: {
            ...DEFAULT_SYSTEM_SETTINGS,
            minimumDetectedBallotScaleOverride,
          },
        })
      );
      expect(await apiClient.configureFromElectionPackageOnUsbDrive()).toEqual(
        ok(electionDefinition)
      );
      mockUsbDrive.removeUsbDrive();

      await apiClient.setTestMode({ testMode: true });

      {
        // define the next scanner session
        const nextSession = scanner.withNextScannerSession();

        // scan a mis-scaled ballot
        const scale = minimumDetectedBallotScaleOverride - 0.1;
        const [frontImageData, backImageData] = asSheet(
          await iter(
            pdfToImages(
              Uint8Array.from(
                await readFile(vxFamousNamesFixtures.blankBallotPath)
              ),
              { scale: (200 / 72) * scale }
            )
          )
            .map(({ page }) => page)
            .toArray()
        );
        const frontPath = makeTemporaryFile();
        const backPath = makeTemporaryFile();
        await writeImageData(frontPath, frontImageData);
        await writeImageData(backPath, backImageData);
        nextSession.sheet({
          frontPath,
          backPath,
          ballotAuditId: 'fake-ballot-audit-id',
        });

        nextSession.end();

        await apiClient.scanBatch();
        await importer.waitForEndOfBatchOrScanningPause();

        // check the latest batch has the expected counts
        const status = await apiClient.getStatus();
        expect(status.batches.length).toEqual(1);
        expect(status.batches[0].count).toEqual(1);
        expect(status.adjudicationsRemaining).toEqual(1);

        // Reject the ballot
        await apiClient.continueScanning({ forceAccept: false });
      }

      {
        mockUsbDrive.insertUsbDrive({});
        mockUsbDrive.usbDrive.sync.expectRepeatedCallsWith().resolves();

        expect(await apiClient.exportCastVoteRecordsToUsbDrive()).toEqual(ok());

        const cvrReportDirectoryPath = (
          await getCastVoteRecordExportDirectoryPaths(mockUsbDrive.usbDrive)
        )[0];
        expect(cvrReportDirectoryPath).toContain('machine_0000__');

        const { castVoteRecordIterator } = (
          await readCastVoteRecordExport(cvrReportDirectoryPath)
        ).unsafeUnwrap();
        const cvrs: CVR.CVR[] = (await castVoteRecordIterator.toArray()).map(
          (castVoteRecordResult) =>
            castVoteRecordResult.unsafeUnwrap().castVoteRecord
        );
        expect(cvrs).toHaveLength(0);
      }
    }
  );
});
