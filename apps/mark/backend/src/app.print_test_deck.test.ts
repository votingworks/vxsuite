/**
 * End-to-end tests for printTestDeck. Deliberately does NOT mock the rendering
 * libraries so that summary ballots and the tally report are rendered for real
 * and can be snapshot-verified.
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Server } from 'node:http';
import {
  constructElectionKey,
  ElectionDefinition,
  safeParseJson,
  SystemSettingsSchema,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  HP_LASER_PRINTER_CONFIG,
  MemoryPrinterHandler,
} from '@votingworks/printing';
import * as grout from '@votingworks/grout';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { MockUsbDrive } from '@votingworks/usb-drive';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  electionFamousNames2021Fixtures,
  systemSettings,
} from '@votingworks/fixtures';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import { createApp } from '../test/app_helpers';
import { Api } from './app';

vi.setConfig({ testTimeout: 90_000 });

const reportPrintedTime = new Date('2021-01-01T00:00:00.000');
vi.mock(import('./util/get_current_time.js'), async (importActual) => ({
  ...(await importActual()),
  getCurrentTime: () => reportPrintedTime.getTime(),
}));

const mockFeatureFlagger = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

let apiClient: grout.Client<Api>;
let logger: Logger;
let mockAuth: InsertedSmartCardAuthApi;
let mockUsbDrive: MockUsbDrive;
let mockPrinterHandler: MemoryPrinterHandler;
let server: Server;

beforeEach(() => {
  mockFeatureFlagger.resetFeatureFlags();
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
  ({ apiClient, logger, mockAuth, mockUsbDrive, mockPrinterHandler, server } =
    createApp());
});

afterEach(() => {
  server?.close();
});

async function configureMachine(
  electionDefinition: ElectionDefinition
): Promise<void> {
  vi.mocked(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: mockElectionManagerUser({
        electionKey: constructElectionKey(electionDefinition.election),
      }),
      sessionExpiresAt: mockSessionExpiresAt(),
    })
  );
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({
      electionDefinition,
      systemSettings: safeParseJson(
        systemSettings.asText(),
        SystemSettingsSchema
      ).unsafeUnwrap(),
    })
  );
  (await apiClient.configureElectionPackageFromUsb()).unsafeUnwrap();
  mockUsbDrive.removeUsbDrive();
}

test('printTestDeck for a single precinct prints ballots and a tally report', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  await configureMachine(electionDefinition);
  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  const precinctId = electionDefinition.election.precincts[0].id;
  await apiClient.printTestDeck({ precinctId });

  // One combined summary-ballot deck PDF + one tally report. The ballot deck's
  // QR codes embed a random `ballotAuditId`, so its rendering is snapshot-tested
  // deterministically in libs/test-decks; here we verify the tally report, which
  // must reflect summary ballots only.
  const jobs = mockPrinterHandler.getPrintJobHistory();
  expect(jobs).toHaveLength(2);

  await expect(jobs[1].filename).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'test-deck-precinct-tally-report',
    failureThreshold: 0.0001,
  });

  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.PrinterPrintRequest,
    expect.objectContaining({
      message: 'Printed summary ballot test deck',
      disposition: 'success',
    })
  );
});

test('printTestDeck for all precincts prints ballots and a tally report', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  await configureMachine(electionDefinition);
  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  await apiClient.printTestDeck({});

  const jobs = mockPrinterHandler.getPrintJobHistory();
  expect(jobs).toHaveLength(2);

  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.PrinterPrintRequest,
    expect.objectContaining({
      message: 'Printed summary ballot test deck',
      disposition: 'success',
    })
  );
});
