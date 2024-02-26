import { assert, err, ok, typedAs } from '@votingworks/basics';
import {
  electionTwoPartyPrimaryFixtures,
  electionGeneral,
  electionGeneralDefinition,
} from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';
import { Buffer } from 'buffer';
import {
  convertVxfElectionToCdfBallotDefinition,
  DEFAULT_SYSTEM_SETTINGS,
  ElectionPackageFileName,
  PrinterStatus,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { suppressingConsoleOutput, zipFile } from '@votingworks/test-utils';
import {
  HP_LASER_PRINTER_CONFIG,
  getMockConnectedPrinterStatus,
} from '@votingworks/printing';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
  mockSystemAdministratorAuth,
  saveTmpFile,
} from '../test/app';

let mockNodeEnv: 'production' | 'test' = 'test';

jest.mock('./globals', (): typeof import('./globals') => ({
  ...jest.requireActual('./globals'),
  get NODE_ENV(): 'production' | 'test' {
    return mockNodeEnv;
  },
}));

beforeEach(() => {
  mockNodeEnv = 'test';
  jest.restoreAllMocks();
});

jest.setTimeout(20_000);

test('uses machine config from env', async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    VX_MACHINE_ID: 'test-machine-id',
    VX_CODE_VERSION: 'test-code-version',
  };

  const { apiClient } = buildTestEnvironment();
  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: 'test-machine-id',
    codeVersion: 'test-code-version',
  });

  process.env = originalEnv;
});

test('uses default machine config if not set', async () => {
  const { apiClient } = buildTestEnvironment();
  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: '0000',
    codeVersion: 'dev',
  });
});

test('managing the current election', async () => {
  const { apiClient, auth, logger } = buildTestEnvironment();

  mockSystemAdministratorAuth(auth);

  expect(await apiClient.getCurrentElectionMetadata()).toBeNull();

  // try configuring with a malformed election package
  const badConfigureResult = await apiClient.configure({
    electionFilePath: saveTmpFile('{}'),
  });
  assert(badConfigureResult.isErr());
  expect(badConfigureResult.err().type).toEqual('invalid-zip');

  // try configuring with malformed election data
  const badElectionPackage = await zipFile({
    [ElectionPackageFileName.ELECTION]: '{}',
  });
  const badElectionConfigureResult = await apiClient.configure({
    electionFilePath: saveTmpFile(badElectionPackage),
  });
  assert(badElectionConfigureResult.isErr());
  expect(badElectionConfigureResult.err().type).toEqual('invalid-election');

  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { electionHash } = electionDefinition;

  const badSystemSettingsPackage = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionDefinition.electionData,
    [ElectionPackageFileName.SYSTEM_SETTINGS]: '{}',
  });
  // try configuring with malformed system settings data
  const badSystemSettingsConfigureResult = await apiClient.configure({
    electionFilePath: saveTmpFile(badSystemSettingsPackage),
  });
  assert(badSystemSettingsConfigureResult.isErr());
  expect(badSystemSettingsConfigureResult.err().type).toEqual(
    'invalid-system-settings'
  );

  // configure with well-formed data
  const goodPackage = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionDefinition.electionData,
    [ElectionPackageFileName.SYSTEM_SETTINGS]: JSON.stringify(
      DEFAULT_SYSTEM_SETTINGS
    ),
  });
  const configureResult = await apiClient.configure({
    electionFilePath: saveTmpFile(goodPackage),
  });
  assert(configureResult.isOk());
  const { electionId } = configureResult.ok();
  expect(logger.log).toHaveBeenNthCalledWith(
    1,
    LogEventId.ElectionConfigured,
    'system_administrator',
    {
      disposition: 'success',
      newElectionHash: electionHash,
    }
  );

  expect(await apiClient.getCurrentElectionMetadata()).toMatchObject({
    isOfficialResults: false,
    id: electionId,
    electionDefinition,
  });

  // mark results as official as election manager
  mockElectionManagerAuth(auth, electionHash);
  await apiClient.markResultsOfficial();
  expect(logger.log).toHaveBeenNthCalledWith(
    2,
    LogEventId.MarkedTallyResultsOfficial,
    'election_manager',
    expect.objectContaining({
      disposition: 'success',
    })
  );
  expect(await apiClient.getCurrentElectionMetadata()).toMatchObject({
    isOfficialResults: true,
    id: electionId,
    electionDefinition,
  });

  // unconfigure as system administrator
  mockSystemAdministratorAuth(auth);
  await apiClient.unconfigure();
  expect(logger.log).toHaveBeenNthCalledWith(
    3,
    LogEventId.ElectionUnconfigured,
    'system_administrator',
    expect.objectContaining({
      disposition: 'success',
    })
  );
  expect(await apiClient.getCurrentElectionMetadata()).toBeNull();

  // confirm we can reconfigure on same app instance
  await configureMachine(apiClient, auth, electionDefinition);
  expect(await apiClient.getCurrentElectionMetadata()).toMatchObject({
    isOfficialResults: false,
    electionDefinition,
  });
});

test('configuring with an election.json file', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  mockSystemAdministratorAuth(auth);

  const electionDefinition = electionGeneralDefinition;
  const configureResult = await apiClient.configure({
    electionFilePath: saveTmpFile(electionDefinition.electionData, '.json'),
  });
  expect(configureResult).toEqual(ok(expect.anything()));

  const badConfigureResult = await apiClient.configure({
    electionFilePath: saveTmpFile('bad json file', '.json'),
  });
  expect(badConfigureResult).toMatchObject(err({ type: 'invalid-election' }));
});

test('configuring with a CDF election', async () => {
  const { apiClient, auth, logger } = buildTestEnvironment();

  mockSystemAdministratorAuth(auth);

  const { electionData, electionHash } = safeParseElectionDefinition(
    JSON.stringify(convertVxfElectionToCdfBallotDefinition(electionGeneral, {}))
  ).unsafeUnwrap();
  const electionPackage = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionData,
  });

  // configure with well-formed election data
  const configureResult = await apiClient.configure({
    electionFilePath: saveTmpFile(electionPackage),
  });
  assert(configureResult.isOk());
  configureResult.ok();
  expect(logger.log).toHaveBeenNthCalledWith(
    1,
    LogEventId.ElectionConfigured,
    'system_administrator',
    {
      disposition: 'success',
      newElectionHash: electionHash,
    }
  );

  const currentElectionMetadata = await apiClient.getCurrentElectionMetadata();
  expect(currentElectionMetadata?.electionDefinition.electionData).toEqual(
    electionData
  );
  expect(currentElectionMetadata?.electionDefinition.electionHash).toEqual(
    electionHash
  );
});

test('configuring with an election not from removable media in prod errs', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  mockNodeEnv = 'production';

  mockSystemAdministratorAuth(auth);

  await suppressingConsoleOutput(
    async () =>
      await expect(() =>
        apiClient.configure({
          electionFilePath: '/media/../tmp/nope',
        })
      ).rejects.toThrow(
        'Can only import election packages from removable media in production'
      )
  );
});

test('getSystemSettings happy path', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  const { electionDefinition, systemSettings } =
    electionTwoPartyPrimaryFixtures;
  await configureMachine(
    apiClient,
    auth,
    electionDefinition,
    JSON.parse(systemSettings.asText())
  );

  mockSystemAdministratorAuth(auth);

  const systemSettingsResult = await apiClient.getSystemSettings();
  assert(systemSettingsResult);
  expect(systemSettingsResult).toEqual(JSON.parse(systemSettings.asText()));
});

test('getSystemSettings returns default system settings when there is no current election', async () => {
  const { apiClient } = buildTestEnvironment();

  const systemSettingsResult = await apiClient.getSystemSettings();
  expect(systemSettingsResult).toEqual(DEFAULT_SYSTEM_SETTINGS);
});

test('listPotentialElectionPackagesOnUsbDrive', async () => {
  const { apiClient, mockUsbDrive } = buildTestEnvironment();

  mockUsbDrive.removeUsbDrive();
  expect(await apiClient.listPotentialElectionPackagesOnUsbDrive()).toEqual(
    err({ type: 'no-usb-drive' })
  );

  mockUsbDrive.insertUsbDrive({});
  expect(await apiClient.listPotentialElectionPackagesOnUsbDrive()).toEqual(
    ok([])
  );

  const fileContents = Buffer.from('doesnt matter');
  mockUsbDrive.insertUsbDrive({
    'election-package-1.zip': fileContents,
    'some-other-file.txt': fileContents,
    'election-package-2.zip': fileContents,
    '_election-package-1.zip': fileContents,
    '._election-package-2.zip': fileContents,
    '.election-package-3.zip': fileContents,
  });
  expect(
    await apiClient.listPotentialElectionPackagesOnUsbDrive()
  ).toMatchObject(
    ok([
      {
        name: 'election-package-2.zip',
        path: expect.stringMatching(/\/election-package-2.zip/),
        ctime: expect.anything(),
      },
      {
        name: 'election-package-1.zip',
        path: expect.stringMatching(/\/election-package-1.zip/),
        ctime: expect.anything(),
      },
    ])
  );
});

test('saveElectionPackageToUsb', async () => {
  const { apiClient, auth, mockUsbDrive } = buildTestEnvironment();
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  mockUsbDrive.insertUsbDrive({});
  const response = await apiClient.saveElectionPackageToUsb();
  expect(response).toEqual(ok());
});

test('saveElectionPackageToUsb when no USB drive', async () => {
  const { apiClient, auth, mockUsbDrive } = buildTestEnvironment();
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  mockUsbDrive.usbDrive.status
    .expectCallWith()
    .resolves({ status: 'no_drive' });
  const response = await apiClient.saveElectionPackageToUsb();
  expect(response).toEqual(
    err({ type: 'missing-usb-drive', message: 'No USB drive found' })
  );
});

test('usbDrive', async () => {
  const {
    apiClient,
    auth,
    mockUsbDrive: { usbDrive },
  } = buildTestEnvironment();
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  mockSystemAdministratorAuth(auth);

  usbDrive.status.expectCallWith().resolves({ status: 'no_drive' });
  expect(await apiClient.getUsbDriveStatus()).toEqual({
    status: 'no_drive',
  });

  usbDrive.status
    .expectCallWith()
    .resolves({ status: 'error', reason: 'bad_format' });
  expect(await apiClient.getUsbDriveStatus()).toMatchObject({
    status: 'error',
    reason: 'bad_format',
  });

  usbDrive.eject.expectCallWith('system_administrator').resolves();
  await apiClient.ejectUsbDrive();

  usbDrive.format.expectCallWith('system_administrator').resolves();
  (await apiClient.formatUsbDrive()).assertOk('format failed');

  const error = new Error('format failed');
  usbDrive.format.expectCallWith('system_administrator').throws(error);
  expect(await apiClient.formatUsbDrive()).toEqual(err(error));
});

test('printer status', async () => {
  const { mockPrinterHandler, apiClient } = buildTestEnvironment();

  expect(await apiClient.getPrinterStatus()).toEqual(
    typedAs<PrinterStatus>({
      connected: false,
    })
  );

  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  expect(await apiClient.getPrinterStatus()).toEqual(
    typedAs<PrinterStatus>(
      getMockConnectedPrinterStatus(HP_LASER_PRINTER_CONFIG)
    )
  );

  mockPrinterHandler.disconnectPrinter();

  expect(await apiClient.getPrinterStatus()).toEqual(
    typedAs<PrinterStatus>({
      connected: false,
    })
  );
});
