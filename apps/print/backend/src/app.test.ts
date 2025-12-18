import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ok } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import {
  BallotType,
  DEV_MACHINE_ID,
  EncodedBallotEntry,
  PrinterStatus,
  safeParseJson,
  SystemSettingsSchema,
} from '@votingworks/types';
import {
  electionFamousNames2021Fixtures,
  systemSettings,
} from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  getMockConnectedPrinterStatus,
  HP_LASER_PRINTER_CONFIG,
} from '@votingworks/printing';
import { Server } from 'node:http';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import { buildTestEnvironment, mockElectionManagerAuth } from '../test/app';

const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

let server: Server | undefined;

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
});

afterEach(() => {
  server?.close();
  server = undefined;
});

test('uses machine config from env', async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    VX_MACHINE_ID: 'test-machine-id',
    VX_CODE_VERSION: 'test-code-version',
  };

  const env = buildTestEnvironment();
  server = env.server;
  const { apiClient } = env;
  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: 'test-machine-id',
    codeVersion: 'test-code-version',
  });

  process.env = originalEnv;
});

test('uses default machine config if not set', async () => {
  const env = buildTestEnvironment();
  server = env.server;
  const { apiClient } = env;
  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: DEV_MACHINE_ID,
    codeVersion: 'dev',
  });
});

test('printer status', async () => {
  const env = buildTestEnvironment();
  server = env.server;
  const { apiClient, mockPrinterHandler } = env;

  expect(await apiClient.getPrinterStatus()).toEqual<PrinterStatus>({
    connected: false,
  });

  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  expect(await apiClient.getPrinterStatus()).toEqual<PrinterStatus>(
    getMockConnectedPrinterStatus(HP_LASER_PRINTER_CONFIG)
  );

  mockPrinterHandler.disconnectPrinter();
  expect(await apiClient.getPrinterStatus()).toEqual<PrinterStatus>({
    connected: false,
  });
});

test('configureElectionPackageFromUsb reads to and writes from store', async () => {
  const env = buildTestEnvironment();
  server = env.server;
  const { apiClient, auth, logger, mockUsbDrive } = env;

  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const parsedSystemSettings = safeParseJson(
    systemSettings.asText(),
    SystemSettingsSchema
  ).unsafeUnwrap();

  // Include ballots because print/backend requires them.
  const ballotStyleId = electionDefinition.election.ballotStyles[0]!.id;
  const precinctId = electionDefinition.election.precincts[0]!.id;
  const ballots: EncodedBallotEntry[] = [
    {
      ballotStyleId,
      precinctId,
      ballotType: BallotType.Precinct,
      ballotMode: 'official',
      encodedBallot: Buffer.from('mock-pdf-data-for-test').toString('base64'),
    },
  ];

  mockElectionManagerAuth(auth, electionDefinition);
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({
      electionDefinition,
      systemSettings: parsedSystemSettings,
      ballots,
    })
  );

  const result = await apiClient.configureElectionPackageFromUsb();
  expect(result).toEqual(ok(expect.anything()));
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionConfigured,
    expect.objectContaining({ disposition: 'success' })
  );

  expect(await apiClient.getElectionRecord()).toEqual({
    electionDefinition,
    electionPackageHash: expect.any(String),
  });

  const storedBallots = await apiClient.getBallots({});
  expect(storedBallots).toHaveLength(1);
  expect(storedBallots[0]).toMatchObject({
    ballotStyleId,
    precinctId,
    ballotType: BallotType.Precinct,
    ballotMode: 'official',
    encodedBallot: expect.any(String),
    ballotPrintId: expect.any(Number),
  });
});
