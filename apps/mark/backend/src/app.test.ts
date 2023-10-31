import { assert } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
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
  ElectionDefinition,
} from '@votingworks/types';
import {
  BALLOT_PACKAGE_FOLDER,
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';

import { Buffer } from 'buffer';
import { mockBallotPackageFileTree } from '@votingworks/backend';
import { Server } from 'http';
import * as grout from '@votingworks/grout';
import { MockUsbDrive } from '@votingworks/usb-drive';
import { createApp } from '../test/app_helpers';
import { Api } from './app';

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
  };
});

let apiClient: grout.Client<Api>;
let mockAuth: InsertedSmartCardAuthApi;
let mockUsbDrive: MockUsbDrive;
let server: Server;

function mockElectionManagerAuth(electionDefinition: ElectionDefinition) {
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakeElectionManagerUser(electionDefinition),
      sessionExpiresAt: fakeSessionExpiresAt(),
    })
  );
}

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_BALLOT_PACKAGE_AUTHENTICATION
  );

  ({ apiClient, mockAuth, mockUsbDrive, server } = createApp());
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

  mockElectionManagerAuth(electionDefinition);

  mockUsbDrive.insertUsbDrive(
    await mockBallotPackageFileTree({
      electionDefinition,
      systemSettings: safeParseJson(
        systemSettings.asText(),
        SystemSettingsSchema
      ).unsafeUnwrap(),
    })
  );

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

  mockElectionManagerAuth(electionDefinition);

  mockUsbDrive.insertUsbDrive(
    await mockBallotPackageFileTree({
      electionDefinition,
      systemSettings: safeParseJson(
        systemSettings.asText(),
        SystemSettingsSchema
      ).unsafeUnwrap(),
    })
  );

  const writeResult = await apiClient.configureBallotPackageFromUsb();
  assert(writeResult.isOk());
  await apiClient.unconfigureMachine();

  const readResult = await apiClient.getSystemSettings();
  expect(readResult).toEqual(DEFAULT_SYSTEM_SETTINGS);
  const electionDefinitionResult = await apiClient.getElectionDefinition();
  expect(electionDefinitionResult).toBeNull();
});

test('configureBallotPackageFromUsb throws when no USB drive mounted', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  mockElectionManagerAuth(electionDefinition);

  mockUsbDrive.usbDrive.status
    .expectCallWith()
    .resolves({ status: 'no_drive' });
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

  mockUsbDrive.insertUsbDrive({
    'some-election': {
      [BALLOT_PACKAGE_FOLDER]: {
        'test-ballot-package.zip': Buffer.from("doesn't matter"),
      },
    },
  });

  const result = await apiClient.configureBallotPackageFromUsb();
  assert(result.isErr());
  expect(result.err()).toEqual('auth_required_before_ballot_package_load');
});

test('usbDrive', async () => {
  const { usbDrive } = mockUsbDrive;

  usbDrive.status.expectCallWith().resolves({ status: 'no_drive' });
  expect(await apiClient.getUsbDriveStatus()).toEqual({
    status: 'no_drive',
  });

  usbDrive.eject.expectCallWith('unknown').resolves();
  await apiClient.ejectUsbDrive();

  mockElectionManagerAuth(electionFamousNames2021Fixtures.electionDefinition);
  usbDrive.eject.expectCallWith('election_manager').resolves();
  await apiClient.ejectUsbDrive();
});
