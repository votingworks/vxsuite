import { assert } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionSampleDefinition,
  systemSettings,
} from '@votingworks/fixtures';
import {
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
  mockOf,
  suppressingConsoleOutput,
} from '@votingworks/test-utils';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import {
  safeParseSystemSettings,
  DEFAULT_SYSTEM_SETTINGS,
  safeParseJson,
  SystemSettingsSchema,
} from '@votingworks/types';

import { Buffer } from 'buffer';
import { createBallotPackageZipArchive, MockUsb } from '@votingworks/backend';
import { Server } from 'http';
import * as grout from '@votingworks/grout';
import { createApp } from '../test/app_helpers';
import { Api } from './app';

let apiClient: grout.Client<Api>;
let mockAuth: InsertedSmartCardAuthApi;
let mockUsb: MockUsb;
let server: Server;

beforeEach(() => {
  ({ apiClient, mockAuth, mockUsb, server } = createApp());
});

afterEach(() => {
  server?.close();
});

test('uses machine config from env', async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    VX_MACHINE_ID: 'test-machine-id',
    VX_CODE_VERSION: 'test-code-version',
    VX_SCREEN_ORIENTATION: 'landscape',
  };

  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: 'test-machine-id',
    codeVersion: 'test-code-version',
    screenOrientation: 'landscape',
  });

  process.env = originalEnv;
});

test('uses default machine config if not set', async () => {
  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: '0000',
    codeVersion: 'dev',
    screenOrientation: 'portrait',
  });
});

test('configureBallotPackageFromUsb reads to and writes from store', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;

  // Mock election manager
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakeElectionManagerUser(electionDefinition),
      sessionExpiresAt: fakeSessionExpiresAt(),
    })
  );

  const zipBuffer = await createBallotPackageZipArchive({
    electionDefinition,
    systemSettings: safeParseJson(
      systemSettings.asText(),
      SystemSettingsSchema
    ).unsafeUnwrap(),
  });
  mockUsb.insertUsbDrive({
    'ballot-packages': {
      'test-ballot-package.zip': zipBuffer,
    },
  });

  const writeResult = await apiClient.configureBallotPackageFromUsb();
  assert(writeResult.isOk());

  const readResult = await apiClient.getSystemSettings();
  expect(readResult).toEqual(
    safeParseSystemSettings(systemSettings.asText()).unsafeUnwrap()
  );
  const electionDefinitionResult = await apiClient.getElectionDefinition();
  expect(electionDefinitionResult).toEqual(electionDefinition);
});

test('unconfigureMachine deletes system settings and election definition', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;

  // Mock election manager
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakeElectionManagerUser(electionDefinition),
      sessionExpiresAt: fakeSessionExpiresAt(),
    })
  );

  const zipBuffer = await createBallotPackageZipArchive({
    electionDefinition,
    systemSettings: safeParseJson(
      systemSettings.asText(),
      SystemSettingsSchema
    ).unsafeUnwrap(),
  });
  mockUsb.insertUsbDrive({
    'ballot-packages': {
      'test-ballot-package.zip': zipBuffer,
    },
  });

  const writeResult = await apiClient.configureBallotPackageFromUsb();
  assert(writeResult.isOk());
  await apiClient.unconfigureMachine();

  const readResult = await apiClient.getSystemSettings();
  expect(readResult).toEqual(DEFAULT_SYSTEM_SETTINGS);
  const electionDefinitionResult = await apiClient.getElectionDefinition();
  expect(electionDefinitionResult).toBeNull();
});

test('configureBallotPackageFromUsb throws when no USB drive mounted', async () => {
  await suppressingConsoleOutput(async () => {
    await expect(apiClient.configureBallotPackageFromUsb()).rejects.toThrow(
      'No USB drive mounted'
    );
  });
});

test('configureBallotPackageFromUsb returns an error if ballot package parsing fails', async () => {
  // Lack of auth will cause ballot package reading to throw
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_out',
      reason: 'no_card',
    })
  );

  mockUsb.insertUsbDrive({
    'ballot-packages': {
      'test-ballot-package.zip': Buffer.from("doesn't matter"),
    },
  });

  const result = await apiClient.configureBallotPackageFromUsb();
  assert(result.isErr());
  expect(result.err()).toEqual('auth_required_before_ballot_package_load');
});

test('configureWithSampleBallotPackageForIntegrationTest configures electionSampleDefinition and DEFAULT_SYSTEM_SETTINGS', async () => {
  const writeResult =
    await apiClient.configureWithSampleBallotPackageForIntegrationTest();
  assert(writeResult.isOk());

  const readResult = await apiClient.getSystemSettings();
  expect(readResult).toEqual(DEFAULT_SYSTEM_SETTINGS);
  const electionDefinitionResult = await apiClient.getElectionDefinition();
  expect(electionDefinitionResult).toEqual(electionSampleDefinition);
});
