import { iter } from '@votingworks/basics';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { pdfToImages } from '@votingworks/image-utils';
import { asSheet, DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { readFile } from 'node:fs/promises';
import { beforeEach, expect, test, vi } from 'vitest';
import { simulateScan, withApp } from '../test/helpers/pdi_helpers';
import { configureApp, waitForStatus } from '../test/helpers/shared_helpers';
import { delays } from './scanners/pdi/state_machine';

const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

beforeEach(() => {
  mockFeatureFlagger.resetFeatureFlags();
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
});

test('scanBatch with streaked page', async () => {
  const [frontImageData, backImageData] = asSheet(
    await iter(
      pdfToImages(
        Uint8Array.from(await readFile(vxFamousNamesFixtures.markedBallotPath)),
        { scale: 200 / 72 }
      )
    )
      .map(({ page }) => page)
      .toArray()
  );

  // add a vertical streak
  for (
    let offset = 500;
    offset < frontImageData.data.length;
    offset += frontImageData.width * 4
  ) {
    frontImageData.data[offset] = 0;
    frontImageData.data[offset + 1] = 0;
    frontImageData.data[offset + 2] = 0;
    frontImageData.data[offset + 3] = 255;
  }

  // try with vertical streak detection enabled
  await withApp(
    async ({
      apiClient,
      clock,
      mockAuth,
      mockScanner,
      mockUsbDrive,
      workspace,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage: {
          electionDefinition: vxFamousNamesFixtures.electionDefinition,
        },
        testMode: true,
      });

      workspace.store.setSystemSettings({
        ...DEFAULT_SYSTEM_SETTINGS,
        // enable vertical streak detection
        disableVerticalStreakDetection: false,
      });

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });
      expect(mockScanner.client.enableScanning).toHaveBeenCalledWith({
        bitonalThreshold: 75,
        doubleFeedDetectionEnabled: true,
        paperLengthInches: 11,
      });

      await simulateScan(apiClient, mockScanner, [
        frontImageData,
        backImageData,
      ]);

      await waitForStatus(apiClient, {
        state: 'rejecting',
        interpretation: {
          type: 'InvalidSheet',
          reason: 'vertical_streaks_detected',
        },
      });
    }
  );

  // try again with vertical streak detection disabled
  await withApp(
    async ({
      apiClient,
      clock,
      mockAuth,
      mockScanner,
      mockUsbDrive,
      workspace,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage: {
          electionDefinition: vxFamousNamesFixtures.electionDefinition,
        },
        testMode: true,
      });

      workspace.store.setSystemSettings({
        ...DEFAULT_SYSTEM_SETTINGS,
        // disable vertical streak detection
        disableVerticalStreakDetection: true,
      });

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });
      expect(mockScanner.client.enableScanning).toHaveBeenCalledWith({
        bitonalThreshold: 75,
        doubleFeedDetectionEnabled: true,
        paperLengthInches: 11,
      });

      await simulateScan(apiClient, mockScanner, [
        frontImageData,
        backImageData,
      ]);

      await waitForStatus(apiClient, {
        state: 'accepting',
        interpretation: {
          type: 'ValidSheet',
        },
      });
    }
  );
});
