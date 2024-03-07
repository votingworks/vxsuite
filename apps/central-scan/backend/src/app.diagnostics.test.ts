import { mockOf } from '@votingworks/test-utils';
import {
  DiskSpaceSummary,
  getBatteryInfo,
  initializeGetWorkspaceDiskSpaceSummary,
  pdfToText,
} from '@votingworks/backend';
import { LogEventId } from '@votingworks/logging';
import { withApp } from '../test/helpers/setup_app';
import { mockSystemAdministratorAuth } from '../test/helpers/auth';

jest.setTimeout(20_000);

jest.mock(
  '@votingworks/backend',
  (): typeof import('@votingworks/backend') => ({
    ...jest.requireActual('@votingworks/backend'),
    getBatteryInfo: jest.fn(),
    initializeGetWorkspaceDiskSpaceSummary: jest.fn(),
  })
);

const MOCK_DISK_SPACE_SUMMARY: DiskSpaceSummary = {
  total: 10 * 1_000_000,
  used: 1 * 1_000_000,
  available: 9 * 1_000_000,
};

beforeEach(() => {
  mockOf(getBatteryInfo).mockResolvedValue({
    level: 0.5,
    discharging: false,
  });
  mockOf(initializeGetWorkspaceDiskSpaceSummary).mockReturnValue(() =>
    Promise.resolve(MOCK_DISK_SPACE_SUMMARY)
  );
});

test('getDiskSpaceSummary', async () => {
  await withApp(async ({ apiClient }) => {
    expect(await apiClient.getApplicationDiskSpaceSummary()).toEqual(
      MOCK_DISK_SPACE_SUMMARY
    );
  });
});

const reportPrintedTime = new Date('2021-01-01T00:00:00.000');
jest.mock('./util/get_current_time', () => ({
  getCurrentTime: () => reportPrintedTime.getTime(),
}));

test('save readiness report', async () => {
  await withApp(async ({ apiClient, mockUsbDrive, auth, logger }) => {
    mockSystemAdministratorAuth(auth);
    mockUsbDrive.insertUsbDrive({});
    const exportResult = await apiClient.saveReadinessReport();
    exportResult.assertOk('Failed to save readiness report');
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.ReadinessReportSaved,
      'system_administrator',
      {
        disposition: 'success',
        message: 'User saved the equipment readiness report to a USB drive.',
      }
    );

    const exportPath = exportResult.ok()![0];
    await expect(exportPath).toMatchPdfSnapshot({
      customSnapshotIdentifier: 'readiness-report',
    });

    const pdfContents = await pdfToText(exportPath);
    expect(pdfContents).toContain('VxCentralScan Equipment Readiness Report');
    expect(pdfContents).toContain('Battery Level: 50%');
    expect(pdfContents).toContain('Power Source: External Power Supply');
    expect(pdfContents).toContain('Free Disk Space: 90% (9 GB / 10 GB)');
    expect(pdfContents).toContain('Connected');

    mockUsbDrive.removeUsbDrive();
  });
});
