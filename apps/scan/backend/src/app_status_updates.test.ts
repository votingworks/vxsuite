import { mockScannerStatus } from '@votingworks/pdi-scanner';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import type { SheetInterpretation } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { beforeEach, expect, test, vi } from 'vitest';
import {
  ballotImages,
  POLLING_PLACE_ID_COMPLETE_HMPB,
  withApp,
} from '../test/helpers/scanner_helpers.js';
import { configureApp, waitForStatus } from '../test/helpers/shared_helpers.js';
import { delays } from './scanner.js';

vi.setConfig({ testTimeout: 20_000 });

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

test('notifies as soon as the scanner status changes', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        testMode: true,
        electionPackage: {
          electionDefinition: vxFamousNamesFixtures.electionDefinition,
        },
        pollingPlaceId: POLLING_PLACE_ID_COMPLETE_HMPB,
      });
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });

      let { revision } = await apiClient.getStatusUpdate({});
      const pending = apiClient.getStatusUpdate({ since: revision });

      mockScanner.emitEvent({ event: 'scanStart' });
      const scanningUpdate = await pending;
      expect(scanningUpdate.statuses.scanner.state).toEqual('scanning');
      expect(scanningUpdate.revision).not.toEqual(revision);

      revision = scanningUpdate.revision;
      mockScanner.setScannerStatus(mockScannerStatus.documentInRear);
      mockScanner.emitEvent({
        event: 'scanComplete',
        images: await ballotImages.completeHmpb(),
      });

      const interpretation: SheetInterpretation = { type: 'ValidSheet' };
      let update = await apiClient.getStatusUpdate({ since: revision });
      while (update.statuses.scanner.state !== 'accepting') {
        update = await apiClient.getStatusUpdate({
          since: update.revision,
        });
      }
      expect(update.statuses.scanner.interpretation).toEqual(interpretation);

      mockScanner.setScannerStatus(mockScannerStatus.idleScanningDisabled);
      const accepted = apiClient.getStatusUpdate({ since: update.revision });
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      const acceptedUpdate = await accepted;
      expect(acceptedUpdate.statuses.scanner).toMatchObject({
        state: 'accepted',
        ballotsCounted: 1,
      });

      const reset = apiClient.getStatusUpdate({
        since: acceptedUpdate.revision,
      });
      await apiClient.setTestMode({ isTestMode: true });
      expect((await reset).statuses.scanner.ballotsCounted).toEqual(0);
    }
  );
});
