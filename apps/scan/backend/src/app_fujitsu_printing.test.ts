import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { configureApp } from '../test/helpers/shared_helpers';
import { withApp } from '../test/helpers/pdi_helpers';

jest.setTimeout(60_000);

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
  };
});

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SCAN_USE_FUJITSU_PRINTER
  );
});

const reportPrintedTime = new Date('2021-01-01T00:00:00.000');
jest.mock('./util/get_current_time', () => ({
  getCurrentTime: () => reportPrintedTime.getTime(),
}));

test('printReport prints first section and printReportSection can print the rest', async () => {
  await withApp(
    async ({
      apiClient,
      mockUsbDrive,
      mockFujitsuPrinterHandler,
      mockAuth,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        openPolls: false,
        electionPackage: {
          electionDefinition: electionTwoPartyPrimaryDefinition,
        },
      });

      (await apiClient.openPolls()).unsafeUnwrap();
      await apiClient.printReport();
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'fujitsu-mammal-report',
      });

      (await apiClient.printReportSection({ index: 1 })).unsafeUnwrap();
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'fujitsu-fish-report',
      });

      (await apiClient.printReportSection({ index: 2 })).unsafeUnwrap();
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'fujitsu-nonpartisan-report',
      });

      expect(mockFujitsuPrinterHandler.getPrintPathHistory()).toHaveLength(3);

      mockFujitsuPrinterHandler.cleanup();
    }
  );
});

test('can print test page', async () => {
  await withApp(
    async ({
      apiClient,
      mockUsbDrive,
      mockFujitsuPrinterHandler,
      mockAuth,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        openPolls: false,
        electionPackage: {
          electionDefinition: electionTwoPartyPrimaryDefinition,
        },
      });

      (await apiClient.printTestPage()).unsafeUnwrap();
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'print-test-page',
      });
    }
  );
});
