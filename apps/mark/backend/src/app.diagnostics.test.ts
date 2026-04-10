import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  BooleanEnvironmentVariableName as Feature,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { Logger, LogEventId } from '@votingworks/logging';
import {
  constructElectionKey,
  DEFAULT_SYSTEM_SETTINGS,
  DiagnosticRecord,
  ElectionPackage,
} from '@votingworks/types';
import { Server } from 'node:http';
import * as grout from '@votingworks/grout';
import { MockUsbDrive } from '@votingworks/usb-drive';
import {
  getDiskSpaceSummary,
  mockElectionPackageFileTree,
} from '@votingworks/backend';
import type { DiskSpaceSummary } from '@votingworks/utils';
import {
  HP_LASER_PRINTER_CONFIG,
  MemoryPrinterHandler,
} from '@votingworks/printing';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import { assertDefined } from '@votingworks/basics';
import { createApp } from '../test/app_helpers';
import { Api } from './app';
import { MockBarcodeClient } from './barcodes/mock_client';

const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

vi.mock(import('./util/accessible_controller.js'), async (importActual) => ({
  ...(await importActual()),
  isAccessibleControllerAttached: vi.fn().mockReturnValue(true),
  isPatInputAttached: vi.fn().mockReturnValue(true),
}));

vi.mock(
  import('@votingworks/backend'),
  async (importActual): Promise<typeof import('@votingworks/backend')> => {
    const actual = await importActual();
    const mockedGetDiskSpaceSummary = vi.fn();
    return {
      ...actual,
      getDiskSpaceSummary: mockedGetDiskSpaceSummary,
      createSystemCallApi: (
        ...args: Parameters<typeof actual.createSystemCallApi>
      ) => ({
        ...actual.createSystemCallApi(...args),
        getDiskSpaceSummary: mockedGetDiskSpaceSummary,
      }),
    };
  }
);

const MOCK_DISK_SPACE_SUMMARY: DiskSpaceSummary = {
  total: 10 * 1_000_000,
  used: 1 * 1_000_000,
  available: 9 * 1_000_000,
};

let apiClient: grout.Client<Api>;
let logger: Logger;
let mockAuth: InsertedSmartCardAuthApi;
let mockUsbDrive: MockUsbDrive;
let mockPrinterHandler: MemoryPrinterHandler;
let server: Server;
let mockBarcodeClient: MockBarcodeClient;

const mockTime = new Date('2021-01-01T00:00:00.000');

async function wrapWithFakeSystemTime<T>(fn: () => Promise<T>): Promise<T> {
  vi.useFakeTimers().setSystemTime(mockTime.getTime());
  const result = await fn();
  vi.useRealTimers();
  return result;
}

const reportPrintedTime = new Date('2021-01-01T00:00:00.000');
vi.mock(import('./util/get_current_time.js'), async (importActual) => ({
  ...(await importActual()),
  getCurrentTime: () => reportPrintedTime.getTime(),
}));

beforeEach(() => {
  mockFeatureFlagger.resetFeatureFlags();
  mockFeatureFlagger.enableFeatureFlag(
    Feature.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  vi.mocked(getDiskSpaceSummary).mockResolvedValue(MOCK_DISK_SPACE_SUMMARY);

  ({
    apiClient,
    mockAuth,
    mockUsbDrive,
    mockBarcodeClient,
    mockPrinterHandler,
    server,
    logger,
  } = createApp());
});

afterEach(() => {
  server?.close();
});

test('getDiskSpaceSummary', async () => {
  const result = await apiClient.getDiskSpaceSummary();
  expect(result).toEqual(MOCK_DISK_SPACE_SUMMARY);
});

test('getMostRecentDiagnostic returns null when no record exists', async () => {
  expect(
    await apiClient.getMostRecentDiagnostic({
      diagnosticType: 'uninterruptible-power-supply',
    })
  ).toBeNull();
});

test('addDiagnosticRecord and getMostRecentDiagnostic', async () => {
  await wrapWithFakeSystemTime(async () => {
    await apiClient.addDiagnosticRecord({
      type: 'mark-pat-input',
      outcome: 'pass',
    });
  });

  expect(
    await apiClient.getMostRecentDiagnostic({
      diagnosticType: 'mark-pat-input',
    })
  ).toEqual<DiagnosticRecord>({
    type: 'mark-pat-input',
    outcome: 'pass',
    timestamp: mockTime.getTime(),
  });
});

test('addDiagnosticRecord logs the outcome', async () => {
  await apiClient.addDiagnosticRecord({
    type: 'mark-headphone-input',
    outcome: 'fail',
    message: 'Test failure message',
  });

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.DiagnosticComplete,
    {
      disposition: 'failure',
      message:
        'Diagnostic (mark-headphone-input) completed with outcome: fail.',
      type: 'mark-headphone-input',
    }
  );
});

test('logUpsDiagnosticOutcome pass', async () => {
  await wrapWithFakeSystemTime(async () => {
    await apiClient.logUpsDiagnosticOutcome({ outcome: 'pass' });
  });

  expect(
    await apiClient.getMostRecentDiagnostic({
      diagnosticType: 'uninterruptible-power-supply',
    })
  ).toEqual<DiagnosticRecord>({
    type: 'uninterruptible-power-supply',
    outcome: 'pass',
    message: 'UPS connected and fully charged per user.',
    timestamp: mockTime.getTime(),
  });

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.DiagnosticComplete,
    {
      disposition: 'success',
      message: 'UPS connected and fully charged per user.',
      type: 'uninterruptible-power-supply',
    }
  );
});

test('logUpsDiagnosticOutcome fail', async () => {
  await wrapWithFakeSystemTime(async () => {
    await apiClient.logUpsDiagnosticOutcome({ outcome: 'fail' });
  });

  expect(
    await apiClient.getMostRecentDiagnostic({
      diagnosticType: 'uninterruptible-power-supply',
    })
  ).toEqual<DiagnosticRecord>({
    type: 'uninterruptible-power-supply',
    outcome: 'fail',
    message: 'UPS not connected or not fully charged per user.',
    timestamp: mockTime.getTime(),
  });

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.DiagnosticComplete,
    {
      disposition: 'failure',
      message: 'UPS not connected or not fully charged per user.',
      type: 'uninterruptible-power-supply',
    }
  );
});

test('printTestPage prints and logs', async () => {
  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  await apiClient.printTestPage();

  await expect(mockPrinterHandler.getLastPrintPath()).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'mark-print-test-page',
    failureThreshold: 0.0001,
  });

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.DiagnosticInit,
    {
      disposition: 'success',
      message: 'User started a print diagnostic by printing a test page.',
    }
  );
});

test('saveReadinessReport - machine not configured', async () => {
  mockUsbDrive.insertUsbDrive({});
  mockUsbDrive.usbDrive.sync.expectCallWith().resolves();

  const result = await apiClient.saveReadinessReport();
  result.assertOk('Failed to save readiness report');

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.ReadinessReportSaved,
    {
      disposition: 'success',
      message: 'User saved the equipment readiness report to a USB drive.',
    }
  );

  const exportPath = result.ok()![0];
  await expect(exportPath).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'mark-readiness-report-not-configured',
  });
});

test('saveReadinessReport - machine configured', async () => {
  setPollingPlacesEnabled(true);

  const fixtures = electionFamousNames2021Fixtures;
  const electionDefinition = fixtures.readElectionDefinition();

  const electionKey = constructElectionKey(electionDefinition.election);
  vi.mocked(mockAuth.getAuthStatus).mockResolvedValue({
    status: 'logged_in',
    user: mockElectionManagerUser({ electionKey }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });

  const systemSettings = DEFAULT_SYSTEM_SETTINGS;
  const electionPkg: ElectionPackage = { electionDefinition, systemSettings };
  mockUsbDrive.insertUsbDrive(await mockElectionPackageFileTree(electionPkg));
  mockUsbDrive.usbDrive.sync.expectCallWith().resolves();

  (await apiClient.configureElectionPackageFromUsb()).unsafeUnwrap();

  const { election } = electionDefinition;
  const [pollingPlace] = assertDefined(election.pollingPlaces);
  await apiClient.setPollingPlaceId({ id: pollingPlace.id });

  vi.useFakeTimers().setSystemTime(mockTime.getTime());
  await apiClient.addDiagnosticRecord({
    type: 'mark-pat-input',
    outcome: 'pass',
  });
  await apiClient.addDiagnosticRecord({
    type: 'mark-headphone-input',
    outcome: 'pass',
  });
  vi.useRealTimers();

  const result = (await apiClient.saveReadinessReport()).unsafeUnwrap();

  const exportPath = result[0];
  await expect(exportPath).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'mark-readiness-report-configured',
  });

  mockUsbDrive.removeUsbDrive();
});

test('saveReadinessReport failure logs error', async () => {
  // Don't insert USB drive to cause failure
  mockUsbDrive.removeUsbDrive();

  const result = await apiClient.saveReadinessReport();
  expect(result.err()).toEqual({
    message: 'No USB drive found',
    type: 'missing-usb-drive',
  });

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.ReadinessReportSaved,
    expect.objectContaining({
      disposition: 'failure',
    })
  );
});

test('getMostRecentBarcodeScan returns null initially', async () => {
  expect(await apiClient.getMostRecentBarcodeScan()).toBeNull();
});

test('getMostRecentBarcodeScan returns scan data after scan', async () => {
  // Simulate a barcode scan
  // eslint-disable-next-line no-restricted-globals
  mockBarcodeClient.emitScan(Buffer.from('test-barcode-data'));

  const result = await apiClient.getMostRecentBarcodeScan();
  expect(result).not.toBeNull();
  expect(result?.data).toEqual('test-barcode-data');
  expect(result?.timestamp).toBeInstanceOf(Date);
});

test('clearLastBarcodeScan clears the scan data', async () => {
  // Simulate a barcode scan
  // eslint-disable-next-line no-restricted-globals
  mockBarcodeClient.emitScan(Buffer.from('test-barcode-data'));

  // Verify scan data exists
  expect(await apiClient.getMostRecentBarcodeScan()).not.toBeNull();

  // Clear it
  await apiClient.clearLastBarcodeScan();

  // Verify it's cleared
  expect(await apiClient.getMostRecentBarcodeScan()).toBeNull();
});

function setPollingPlacesEnabled(enabled: boolean) {
  if (enabled) {
    mockFeatureFlagger.enableFeatureFlag(Feature.ENABLE_POLLING_PLACES);
  } else {
    mockFeatureFlagger.disableFeatureFlag(Feature.ENABLE_POLLING_PLACES);
  }
}
