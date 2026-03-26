import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  electionTwoPartyPrimaryFixtures,
  electionPrimaryPrecinctSplitsFixtures,
} from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { HP_LASER_PRINTER_CONFIG, renderToPdf } from '@votingworks/printing';
import { err } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import {
  DEFAULT_SYSTEM_SETTINGS,
  ElectionPackageFileName,
  ElectionRegisteredVotersCounts,
} from '@votingworks/types';
import { zipFile } from '@votingworks/test-utils';
import {
  buildTestEnvironment,
  configureMachine,
  expectUsbDriveSync,
  mockElectionManagerAuth,
  mockSystemAdministratorAuth,
  saveTmpFile,
} from '../test/app';
import { mockFileName } from '../test/csv';
import { generateReportPath } from './util/filenames';

const reportPrintedTime = new Date('2021-01-01T00:00:00.000');
vi.mock(import('./util/get_current_time.js'), async (importActual) => ({
  ...(await importActual()),
  getCurrentTime: () => reportPrintedTime.getTime(),
}));

vi.mock(import('@votingworks/types'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    formatElectionHashes: vi.fn().mockReturnValue('1111111-0000000'),
  };
});

const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

vi.mock(import('@votingworks/printing'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    renderToPdf: vi.fn(original.renderToPdf),
  } as unknown as typeof import('@votingworks/printing');
});

beforeEach(() => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CVR_BALLOT_HASH_CHECK
  );
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
  );
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

test('configure persists registered voter counts from election package', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { apiClient, auth, workspace } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  const registeredVoterCounts: ElectionRegisteredVotersCounts = {
    'precinct-1': 500,
    'precinct-2': 400,
  };
  const electionPackageBuffer = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionDefinition.electionData,
    [ElectionPackageFileName.SYSTEM_SETTINGS]: JSON.stringify(
      DEFAULT_SYSTEM_SETTINGS
    ),
    [ElectionPackageFileName.REGISTERED_VOTERS_COUNTS]: JSON.stringify(
      registeredVoterCounts
    ),
  });
  const electionFilePath = saveTmpFile(electionPackageBuffer);
  const { electionId } = (
    await apiClient.configure({ electionFilePath })
  ).unsafeUnwrap();

  expect(workspace.store.getRegisteredVoterCounts(electionId)).toEqual(
    registeredVoterCounts
  );
});

test('configure without registered voter counts stores nothing', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { apiClient, auth, workspace } = buildTestEnvironment();

  const electionId = await configureMachine(
    apiClient,
    auth,
    electionDefinition
  );

  expect(workspace.store.getRegisteredVoterCounts(electionId)).toBeUndefined();
});

test('voter turnout report preview, print, and export', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();

  const { apiClient, auth, mockPrinterHandler, mockMultiUsbDrive } =
    buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition, {
    'precinct-1': 500,
    'precinct-2': 400,
  });
  mockElectionManagerAuth(auth, electionDefinition.election);

  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  mockMultiUsbDrive.insertUsbDrive({});
  expectUsbDriveSync(mockMultiUsbDrive);

  const preview = await apiClient.getVoterTurnoutReportPreview();
  expect(preview.warning).toBeUndefined();
  await expect(preview.pdf).toMatchPdfSnapshot({
    failureThreshold: 0.0001,
    customSnapshotIdentifier: 'voter-turnout-report',
  });

  await apiClient.printVoterTurnoutReport();
  const printPath = mockPrinterHandler.getLastPrintPath();
  expect(printPath).toBeDefined();
  await expect(printPath).toMatchPdfSnapshot({
    failureThreshold: 0.0001,
    customSnapshotIdentifier: 'voter-turnout-report',
  });

  const filename = mockFileName('pdf');
  const exportResult = await apiClient.exportVoterTurnoutReportPdf({
    filename,
  });
  const [filePath] = exportResult.unsafeUnwrap();
  await expect(filePath).toMatchPdfSnapshot({
    failureThreshold: 0.0001,
    customSnapshotIdentifier: 'voter-turnout-report',
  });
});

test('voter turnout report logging', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();

  const { apiClient, auth, logger, mockPrinterHandler, mockUsbDrive } =
    buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition, {
    'precinct-1': 500,
    'precinct-2': 400,
  });
  mockElectionManagerAuth(auth, electionDefinition.election);
  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  mockUsbDrive.insertUsbDrive({});
  expectUsbDriveSync(mockUsbDrive);

  // successful file export
  const validFileName = mockFileName('pdf');
  const validExportResult = await apiClient.exportVoterTurnoutReportPdf({
    filename: validFileName,
  });
  validExportResult.assertOk('export should have succeeded');
  const usbRelativeFilePath = generateReportPath(
    electionDefinition,
    validFileName
  );
  expect(logger.log).lastCalledWith(LogEventId.FileSaved, 'election_manager', {
    disposition: 'success',
    message: `Saved voter turnout report PDF file to ${usbRelativeFilePath} on the USB drive.`,
    path: usbRelativeFilePath,
  });

  // failed file export
  mockUsbDrive.removeUsbDrive();
  const invalidFilename = mockFileName('pdf');
  const invalidExportResult = await apiClient.exportVoterTurnoutReportPdf({
    filename: invalidFilename,
  });
  invalidExportResult.assertErr('export should have failed');
  const invalidUsbRelativeFilePath = generateReportPath(
    electionDefinition,
    invalidFilename
  );
  expect(logger.log).lastCalledWith(LogEventId.FileSaved, 'election_manager', {
    disposition: 'failure',
    message: `Failed to save voter turnout report PDF file to ${invalidUsbRelativeFilePath} on the USB drive.`,
    path: invalidUsbRelativeFilePath,
  });

  // successful print
  await apiClient.printVoterTurnoutReport();
  expect(logger.log).lastCalledWith(
    LogEventId.ElectionReportPrinted,
    'election_manager',
    {
      message: `User printed the voter turnout report.`,
      disposition: 'success',
    }
  );

  // failed print
  mockPrinterHandler.disconnectPrinter();
  await apiClient.printVoterTurnoutReport();
  expect(logger.log).lastCalledWith(
    LogEventId.ElectionReportPrinted,
    'election_manager',
    {
      message: `Error in attempting to print the voter turnout report: cannot print without printer connected`,
      disposition: 'failure',
    }
  );

  // preview
  await apiClient.getVoterTurnoutReportPreview();
  expect(logger.log).lastCalledWith(
    LogEventId.ElectionReportPreviewed,
    'election_manager',
    {
      message: `User previewed the voter turnout report.`,
      disposition: 'success',
    }
  );
});

test('voter turnout report warning', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition, {
    'precinct-1': 500,
    'precinct-2': 400,
  });
  mockElectionManagerAuth(auth, electionDefinition.election);

  vi.mocked(renderToPdf).mockResolvedValueOnce(err('content-too-large'));
  expect(await apiClient.getVoterTurnoutReportPreview()).toEqual({
    pdf: undefined,
    warning: { type: 'content-too-large' },
  });
});

test('voter turnout report with split precinct registered voter counts', async () => {
  const electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  const { apiClient, auth, workspace } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  const registeredVoterCounts: ElectionRegisteredVotersCounts = {
    'precinct-c2': {
      splits: {
        'precinct-c2-split-1': 200,
        'precinct-c2-split-2': 150,
      },
    },
  };
  const electionPackageBuffer = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionDefinition.electionData,
    [ElectionPackageFileName.SYSTEM_SETTINGS]: JSON.stringify(
      DEFAULT_SYSTEM_SETTINGS
    ),
    [ElectionPackageFileName.REGISTERED_VOTERS_COUNTS]: JSON.stringify(
      registeredVoterCounts
    ),
  });
  const electionFilePath = saveTmpFile(electionPackageBuffer);
  const { electionId } = (
    await apiClient.configure({ electionFilePath })
  ).unsafeUnwrap();

  expect(workspace.store.getRegisteredVoterCounts(electionId)).toEqual(
    registeredVoterCounts
  );
});
