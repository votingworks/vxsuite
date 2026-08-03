import { beforeEach, describe, expect, test, vi } from 'vitest';
import { assert, assertDefined, err, ok } from '@votingworks/basics';
import {
  electionTwoPartyPrimaryFixtures,
  makeTemporaryFileAsync,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';
import { Buffer } from 'node:buffer';
import { readdirSync } from 'node:fs';
import {
  convertVxfElectionToCdfBallotDefinition,
  DEFAULT_SYSTEM_SETTINGS,
  DEV_MACHINE_ID,
  ElectionPackageFileName,
  LATEST_METADATA,
  ElectionRegisteredVoterCounts,
  PrinterStatus,
  safeParseElectionDefinition,
  testElectionReport,
  testElectionReportUnsupportedContestType,
  Admin,
  Tabulation,
} from '@votingworks/types';
import { suppressingConsoleOutput, zipFile } from '@votingworks/test-utils';
import {
  HP_LASER_PRINTER_CONFIG,
  getMockConnectedPrinterStatus,
} from '@votingworks/printing';
import {
  attachUsbDrive,
  buildTestEnvironment,
  configureMachine,
  devsdb,
  mockElectionManagerAuth,
  mockSystemAdministratorAuth,
  saveTmpFile,
} from '../test/app.js';
import { isMultiStationAdjudicationEnabled } from './multi_station_config.js';
import { ManualResultsIdentifier, ManualResultsRecord } from './types.js';

const electionGeneralDefinition = readElectionGeneralDefinition();
const electionGeneral = electionGeneralDefinition.election;

let mockNodeEnv: 'production' | 'test' = 'test';

vi.mock(
  './globals.js',
  async (importActual): Promise<typeof import('./globals.js')> => ({
    ...(await importActual()),
    get NODE_ENV(): 'production' | 'test' {
      return mockNodeEnv;
    },
  })
);

vi.mock('./multi_station_config', () => ({
  isMultiStationAdjudicationEnabled: vi.fn(() => false),
}));

beforeEach(() => {
  mockNodeEnv = 'test';
  vi.clearAllMocks();
});

vi.setConfig({
  testTimeout: 20_000,
});

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
    machineId: DEV_MACHINE_ID,
    codeVersion: 'dev',
  });
});

test('getMachineMode and setMachineMode', async () => {
  const { apiClient } = buildTestEnvironment();
  expect(await apiClient.getMachineMode()).toEqual('host');

  await apiClient.setMachineMode({ mode: 'client' });
  expect(await apiClient.getMachineMode()).toEqual('client');

  await apiClient.setMachineMode({ mode: 'host' });
  expect(await apiClient.getMachineMode()).toEqual('host');
});

test.each([{ helperReturns: true }, { helperReturns: false }])(
  'isMultiStationAdjudicationEnabled returns $helperReturns when the helper returns $helperReturns',
  async ({ helperReturns }) => {
    vi.mocked(isMultiStationAdjudicationEnabled).mockReturnValue(helperReturns);
    const { apiClient } = buildTestEnvironment();
    expect(await apiClient.isMultiStationAdjudicationEnabled()).toEqual(
      helperReturns
    );
  }
);

test('setMachineMode throws when election is configured', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  const electionDefinition = readElectionGeneralDefinition();
  await configureMachine(apiClient, auth, electionDefinition);

  await suppressingConsoleOutput(() =>
    expect(apiClient.setMachineMode({ mode: 'client' })).rejects.toThrow(
      'Cannot change machine mode while an election is configured.'
    )
  );
});

test('getNetworkStatus returns offline with no connected clients by default', async () => {
  const { apiClient } = buildTestEnvironment();
  expect(await apiClient.getNetworkStatus()).toEqual({
    isOnline: false,
    connectedClients: [],
    multipleHostsDetected: false,
  });
});

test('getNetworkStatus returns online when host is connected', async () => {
  const { apiClient, workspace } = buildTestEnvironment();
  workspace.store.setNetworkedMachineStatus(
    DEV_MACHINE_ID,
    'host',
    Admin.ClientMachineStatus.Active
  );
  expect(await apiClient.getNetworkStatus()).toMatchObject({
    isOnline: true,
    connectedClients: [],
  });
});

test('getNetworkStatus returns all clients including disconnected', async () => {
  const { apiClient, workspace } = buildTestEnvironment();
  workspace.store.setNetworkedMachineStatus(
    DEV_MACHINE_ID,
    'host',
    Admin.ClientMachineStatus.Active
  );
  workspace.store.setNetworkedMachineStatus(
    'CLIENT-001',
    'client',
    Admin.ClientMachineStatus.Active
  );
  workspace.store.setNetworkedMachineStatus(
    'CLIENT-002',
    'client',
    Admin.ClientMachineStatus.Offline
  );
  const status = await apiClient.getNetworkStatus();
  expect(status.isOnline).toEqual(true);
  expect(status.connectedClients).toHaveLength(2);
  expect(status.connectedClients[0]).toMatchObject({
    machineId: 'CLIENT-001',
    status: Admin.ClientMachineStatus.Active,
  });
  expect(status.connectedClients[1]).toMatchObject({
    machineId: 'CLIENT-002',
    status: Admin.ClientMachineStatus.Offline,
  });
});

test('getIsClientAdjudicationEnabled and setIsClientAdjudicationEnabled', async () => {
  const { apiClient } = buildTestEnvironment();
  expect(await apiClient.getIsClientAdjudicationEnabled()).toEqual(false);
  await apiClient.setIsClientAdjudicationEnabled({ enabled: true });
  expect(await apiClient.getIsClientAdjudicationEnabled()).toEqual(true);
  await apiClient.setIsClientAdjudicationEnabled({ enabled: false });
  expect(await apiClient.getIsClientAdjudicationEnabled()).toEqual(false);
});

test('managing the current election', async () => {
  const { apiClient, auth, logger } = buildTestEnvironment();

  mockSystemAdministratorAuth(auth);

  expect(await apiClient.getCurrentElectionMetadata()).toBeNull();

  // try configuring with a malformed election package
  const badConfigureResult = await apiClient.configure({
    electionFilePath: saveTmpFile('{}'),
  });
  expect(badConfigureResult).toEqual(
    err(expect.objectContaining({ type: 'invalid-zip' }))
  );
  expect(logger.log).toHaveBeenNthCalledWith(
    1,
    LogEventId.ElectionConfigured,
    'system_administrator',
    expect.objectContaining({
      disposition: 'failure',
    })
  );

  // try configuring with malformed election data
  const badElectionPackage = await zipFile({
    [ElectionPackageFileName.ELECTION]: '{}',
    [ElectionPackageFileName.METADATA]: JSON.stringify(LATEST_METADATA),
    [ElectionPackageFileName.SYSTEM_SETTINGS]: JSON.stringify(
      DEFAULT_SYSTEM_SETTINGS
    ),
  });
  const badElectionConfigureResult = await apiClient.configure({
    electionFilePath: saveTmpFile(badElectionPackage),
  });
  expect(badElectionConfigureResult).toEqual(
    err(expect.objectContaining({ type: 'invalid-election' }))
  );

  expect(logger.log).toHaveBeenNthCalledWith(
    2,
    LogEventId.ElectionConfigured,
    'system_administrator',
    expect.objectContaining({
      disposition: 'failure',
    })
  );

  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { ballotHash } = electionDefinition;

  const badSystemSettingsPackage = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionDefinition.electionData,
    [ElectionPackageFileName.METADATA]: JSON.stringify(LATEST_METADATA),
    [ElectionPackageFileName.SYSTEM_SETTINGS]: '{}',
  });
  // try configuring with malformed system settings data
  const badSystemSettingsConfigureResult = await apiClient.configure({
    electionFilePath: saveTmpFile(badSystemSettingsPackage),
  });
  expect(badSystemSettingsConfigureResult).toEqual(
    err(expect.objectContaining({ type: 'invalid-system-settings' }))
  );
  expect(logger.log).toHaveBeenNthCalledWith(
    3,
    LogEventId.ElectionConfigured,
    'system_administrator',
    expect.objectContaining({
      disposition: 'failure',
    })
  );

  // configure with well-formed data
  const goodPackage = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionDefinition.electionData,
    [ElectionPackageFileName.METADATA]: JSON.stringify(LATEST_METADATA),
    [ElectionPackageFileName.SYSTEM_SETTINGS]: JSON.stringify(
      DEFAULT_SYSTEM_SETTINGS
    ),
    [ElectionPackageFileName.APP_STRINGS]: JSON.stringify({}),
  });
  const { electionId } = (
    await apiClient.configure({
      electionFilePath: saveTmpFile(goodPackage),
    })
  ).unsafeUnwrap();
  expect(logger.log).toHaveBeenNthCalledWith(
    4,
    LogEventId.ElectionConfigured,
    'system_administrator',
    {
      disposition: 'success',
      newBallotHash: ballotHash,
    }
  );

  expect(await apiClient.getCurrentElectionMetadata()).toMatchObject({
    isOfficialResults: false,
    id: electionId,
    electionDefinition,
  });

  // mark results as official as election manager
  mockElectionManagerAuth(auth, electionDefinition.election);
  await apiClient.markResultsOfficial();
  expect(logger.log).toHaveBeenNthCalledWith(
    5,
    LogEventId.MarkedTallyResultsOfficial,
    'election_manager',
    expect.objectContaining({
      disposition: 'success',
      official: true,
    })
  );
  expect(await apiClient.getCurrentElectionMetadata()).toMatchObject({
    isOfficialResults: true,
    id: electionId,
    electionDefinition,
  });

  // revert results to unofficial as system administrator
  mockSystemAdministratorAuth(auth);
  await apiClient.revertResultsToUnofficial();
  expect(logger.log).toHaveBeenNthCalledWith(
    6,
    LogEventId.MarkedTallyResultsOfficial,
    'system_administrator',
    expect.objectContaining({
      disposition: 'success',
      official: false,
    })
  );
  expect(await apiClient.getCurrentElectionMetadata()).toMatchObject({
    isOfficialResults: false,
    id: electionId,
    electionDefinition,
  });

  // unconfigure as system administrator
  mockSystemAdministratorAuth(auth);
  await apiClient.unconfigure();
  expect(logger.log).toHaveBeenNthCalledWith(
    7,
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
  const { apiClient, auth, workspace } = buildTestEnvironment();

  mockSystemAdministratorAuth(auth);

  const electionDefinition = electionGeneralDefinition;
  const configureResult = await apiClient.configure({
    electionFilePath: saveTmpFile(electionDefinition.electionData, '.json'),
  });
  expect(configureResult).toEqual(ok(expect.anything()));

  // The temporary package built from the election.json is cleaned up
  expect(
    readdirSync(workspace.path).filter((entry) =>
      entry.startsWith('imported-election-package')
    )
  ).toEqual([]);

  const badConfigureResult = await apiClient.configure({
    electionFilePath: saveTmpFile('bad json file', '.json'),
  });
  expect(badConfigureResult).toMatchObject(err({ type: 'invalid-election' }));
});

test('configuring with a CDF election', async () => {
  const { apiClient, auth, logger } = buildTestEnvironment();

  mockSystemAdministratorAuth(auth);

  const { electionData, ballotHash } = safeParseElectionDefinition(
    JSON.stringify(convertVxfElectionToCdfBallotDefinition(electionGeneral))
  ).unsafeUnwrap();
  const electionPackage = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionData,
    [ElectionPackageFileName.METADATA]: JSON.stringify(LATEST_METADATA),
    [ElectionPackageFileName.SYSTEM_SETTINGS]: JSON.stringify(
      DEFAULT_SYSTEM_SETTINGS
    ),
    [ElectionPackageFileName.APP_STRINGS]: JSON.stringify({}),
  });

  // configure with well-formed election data
  (
    await apiClient.configure({
      electionFilePath: saveTmpFile(electionPackage),
    })
  ).unsafeUnwrap();
  expect(logger.log).toHaveBeenNthCalledWith(
    1,
    LogEventId.ElectionConfigured,
    'system_administrator',
    {
      disposition: 'success',
      newBallotHash: ballotHash,
    }
  );

  const currentElectionMetadata = await apiClient.getCurrentElectionMetadata();
  expect(currentElectionMetadata?.electionDefinition.electionData).toEqual(
    electionData
  );
  expect(currentElectionMetadata?.electionDefinition.ballotHash).toEqual(
    ballotHash
  );

  // Ensure loading auth election key from db works
  mockElectionManagerAuth(auth, electionGeneral);
  expect(await apiClient.getAuthStatus()).toMatchObject({
    status: 'logged_in',
  });
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

  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { systemSettings } = electionTwoPartyPrimaryFixtures;
  await configureMachine(
    apiClient,
    auth,
    electionDefinition,
    undefined,
    JSON.parse(systemSettings.asText())
  );

  mockSystemAdministratorAuth(auth);

  const systemSettingsResult = await apiClient.getSystemSettings();
  assert(systemSettingsResult);
  expect(systemSettingsResult).toEqual(JSON.parse(systemSettings.asText()));
});

test('getRegisteredVoterCounts', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const registeredVoterCounts: ElectionRegisteredVoterCounts = {
    'precinct-1': 500,
    'precinct-2': 400,
  };

  const { apiClient, auth } = buildTestEnvironment();
  mockElectionManagerAuth(auth, electionDefinition.election);

  // returns null when unconfigured
  expect(await apiClient.getRegisteredVoterCounts()).toBeNull();

  await configureMachine(
    apiClient,
    auth,
    electionDefinition,
    registeredVoterCounts
  );
  mockElectionManagerAuth(auth, electionDefinition.election);

  // returns counts when configured with RV data
  expect(await apiClient.getRegisteredVoterCounts()).toEqual(
    registeredVoterCounts
  );
});

test('getRegisteredVoterCounts returns null when election has no RV counts', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  expect(await apiClient.getRegisteredVoterCounts()).toBeNull();
});

test('getSystemSettings returns default system settings when there is no current election', async () => {
  const { apiClient } = buildTestEnvironment();

  const systemSettingsResult = await apiClient.getSystemSettings();
  expect(systemSettingsResult).toEqual(DEFAULT_SYSTEM_SETTINGS);
});

test('listPotentialElectionPackagesOnUsbDrive', async () => {
  const { apiClient, usbPlatform } = buildTestEnvironment();

  expect(
    await apiClient.listPotentialElectionPackagesOnUsbDrive()
  ).toMatchObject(err({ type: expect.any(String) }));

  await attachUsbDrive(apiClient, usbPlatform);
  expect(await apiClient.listPotentialElectionPackagesOnUsbDrive()).toEqual(
    ok([])
  );

  const fileContents = Buffer.from('doesnt matter');
  usbPlatform.replaceDriveData(devsdb, {
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
  const { apiClient, auth, usbPlatform } = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  await configureMachine(apiClient, auth, electionDefinition);

  await attachUsbDrive(apiClient, usbPlatform);
  const response = await apiClient.saveElectionPackageToUsb();
  expect(response).toEqual(ok());
});

test('saveElectionPackageToUsb when no USB drive', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  await configureMachine(apiClient, auth, electionDefinition);

  const response = await apiClient.saveElectionPackageToUsb();
  expect(response).toEqual(
    err({ type: 'missing-usb-drive', message: 'No USB drive found' })
  );
});

test('usbDrive', async () => {
  const { apiClient, auth, usbPlatform } = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  await configureMachine(apiClient, auth, electionDefinition);

  mockSystemAdministratorAuth(auth);

  expect(await apiClient.getUsbDriveStatus()).toEqual({
    status: 'no_drive',
  });

  await attachUsbDrive(apiClient, usbPlatform);
  expect(await apiClient.getUsbDriveStatus()).toMatchObject({
    status: 'mounted',
    mountpoint: expect.any(String),
  });

  // ext4 drives are filtered out by the adapter — they appear as no_drive
  await usbPlatform.formatDrive(devsdb, 'ext4', 'MY-LABEL');
  expect(await apiClient.getUsbDriveStatus()).toEqual({
    status: 'no_drive',
  });
  await apiClient.ejectUsbDrive();

  await usbPlatform.formatDrive(devsdb, 'fat32', 'MY-LABEL');
  (await apiClient.formatUsbDrive()).assertOk('format failed');
  expect(usbPlatform.getSimulatedDrives()[0]?.partition?.fstype).toEqual(
    'fat32'
  );

  const error = new Error('format failed');
  usbPlatform.faults.failNext('formatDrive', error);
  expect(await apiClient.formatUsbDrive()).toEqual(err(error));
});

test('waitForUsbDriveChange returns immediately when the sequence is already ahead', async () => {
  const { apiClient, usbPlatform } = buildTestEnvironment();
  // Attaching a drive advances the change sequence past the caller's `lastSeq`.
  await attachUsbDrive(apiClient, usbPlatform);

  // Because a change already happened, the poll resolves without waiting.
  const seq = await apiClient.waitForUsbDriveChange({ lastSeq: 0 });
  expect(seq).toBeGreaterThan(0);
});

test('waitForUsbDriveChange waits for and reports the next change', async () => {
  const { apiClient, usbPlatform } = buildTestEnvironment();
  await attachUsbDrive(apiClient, usbPlatform);

  // Learn the current sequence (this returns immediately since attaching the
  // drive already advanced it), giving us a quiet baseline.
  const baselineSeq = await apiClient.waitForUsbDriveChange({ lastSeq: 0 });

  // With no change since the baseline, this poll parks until the next change.
  let observedSeq: number | undefined;
  void apiClient.waitForUsbDriveChange({ lastSeq: baselineSeq }).then((seq) => {
    observedSeq = seq;
  });

  // The sequence can only advance when we drive `usbPlatform`, so it stays
  // frozen here. A couple of round-trips give the poll time to park; it must
  // not resolve while nothing has changed.
  await apiClient.getUsbDriveStatus();
  await apiClient.getUsbDriveStatus();
  expect(observedSeq).toBeUndefined();

  // Now a change wakes the parked poll. Toggle presence in case a single
  // filesystem event is missed.
  let present = true;
  await vi.waitFor(
    () => {
      present = !present;
      if (present) {
        usbPlatform.insertDrive(devsdb);
      } else {
        usbPlatform.removeDrive(devsdb);
      }
      expect(observedSeq).toBeGreaterThan(baselineSeq);
    },
    { timeout: 10_000, interval: 250 }
  );
});

test('usbDrive without proper auth', async () => {
  const { apiClient, auth, usbPlatform } = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  await configureMachine(apiClient, auth, electionDefinition);

  mockElectionManagerAuth(auth, electionDefinition.election);
  usbPlatform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
  (await apiClient.formatUsbDrive()).assertErr(
    'Formatting USB drive requires system administrator auth.'
  );
});

test('printer status', async () => {
  const { mockPrinterHandler, apiClient } = buildTestEnvironment();

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

describe('ERR file import', () => {
  test('success', async () => {
    const { apiClient, auth } = buildTestEnvironment();
    await configureMachine(apiClient, auth, electionGeneralDefinition);
    // TODO: Get this fixture back in sync with the election definition - it's fallen out of sync
    const errContents = testElectionReport;
    const filepath = await makeTemporaryFileAsync({
      content: JSON.stringify(errContents),
    });
    const manualResultsIdentifier: ManualResultsIdentifier = {
      precinctId: '21',
      ballotStyleGroupId: '12',
      votingMethod: 'precinct',
    };

    const result = await apiClient.importElectionResultsReportingFile({
      ...manualResultsIdentifier,
      filepath,
    });

    expect(result).toEqual(ok());

    const manualResults = await apiClient.getManualResults(
      manualResultsIdentifier
    );
    const councilContest = assertDefined(
      manualResults?.manualResults.contestResults['city-council']
    ) as Tabulation.CandidateContestResults;
    const writeInTally = assertDefined(
      Object.values(councilContest.tallies).find(
        (tally) => tally.name === 'Alvin Boone and James Lian'
      ),
      'No write-in tally found'
    );
    const writeInId = writeInTally.id;

    const expected: ManualResultsRecord = {
      precinctId: '21',
      ballotStyleGroupId: '12',
      votingMethod: 'precinct',
      manualResults: {
        ballotCount: 65,
        contestResults: {
          'question-a': {
            contestId: 'question-a',
            contestType: 'yesno',
            tallies: {
              'fishing-yes': 30,
              'fishing-no': 29,
            },
            overvotes: 1,
            undervotes: 5,
            ballots: 65,
          },
          'city-council': {
            contestId: 'city-council',
            contestType: 'candidate',
            votesAllowed: 2,
            overvotes: 8,
            undervotes: 2,
            ballots: 65,
            tallies: {
              'barchi-hallaren': {
                id: 'barchi-hallaren',
                name: 'Joseph Barchi and Joseph Hallaren',
                tally: 60,
              },
              'cramer-vuocolo': {
                id: 'cramer-vuocolo',
                name: 'Adam Cramer and Greg Vuocolo',
                tally: 30,
              },
              'court-blumhardt': {
                id: 'court-blumhardt',
                name: 'Daniel Court and Amy Blumhardt',
                tally: 25,
              },
              [writeInId]: {
                id: writeInId,
                isWriteIn: true,
                name: 'Alvin Boone and James Lian',
                tally: 5,
              },
            },
          },
        },
      },
      createdAt: expect.any(String),
    };

    expect(manualResults).toEqual(expected);
  });

  test('can handle write-ins with the same election, contest, and name', async () => {
    const { apiClient, auth } = buildTestEnvironment();
    await configureMachine(apiClient, auth, electionGeneralDefinition);
    const errContents = testElectionReport;
    const filepath = await makeTemporaryFileAsync({
      content: JSON.stringify(errContents),
    });

    // Import the ERR file with write-ins once for precinct tallies
    const manualResultsIdentifier: ManualResultsIdentifier = {
      precinctId: '21',
      ballotStyleGroupId: '12',
      votingMethod: 'precinct',
    };

    let result = await apiClient.importElectionResultsReportingFile({
      ...manualResultsIdentifier,
      filepath,
    });

    expect(result).toEqual(ok());

    // Import the same ERR file again for absentee tallies
    manualResultsIdentifier.votingMethod = 'absentee';
    result = await apiClient.importElectionResultsReportingFile({
      ...manualResultsIdentifier,
      filepath,
    });

    // Expect no error when importing a write-in candidate with exactly the same {election, contest, name} combination
    expect(result).toEqual(ok());
  });

  test('logs when file parsing fails', async () => {
    const { apiClient, auth } = buildTestEnvironment();
    await configureMachine(apiClient, auth, electionGeneralDefinition);
    const errContents = 'not json';
    const filepath = await makeTemporaryFileAsync({
      content: JSON.stringify(errContents),
    });
    const manualResultsIdentifier: ManualResultsIdentifier = {
      precinctId: '21',
      ballotStyleGroupId: '12',
      votingMethod: 'precinct',
    };

    const result = await apiClient.importElectionResultsReportingFile({
      ...manualResultsIdentifier,
      filepath,
    });
    expect(result.err()?.type).toEqual('parsing-failed');
  });

  test('rejects when conversion to VX tabulation format fails', async () => {
    const { apiClient, auth } = buildTestEnvironment();
    await configureMachine(apiClient, auth, electionGeneralDefinition);
    const errContents = testElectionReportUnsupportedContestType;
    const filepath = await makeTemporaryFileAsync({
      content: JSON.stringify(errContents),
    });
    const manualResultsIdentifier: ManualResultsIdentifier = {
      precinctId: assertDefined(electionGeneralDefinition.election.precincts[0])
        .id,
      ballotStyleGroupId: assertDefined(
        electionGeneralDefinition.election.ballotStyles[0]
      ).groupId,
      votingMethod: 'precinct',
    };

    const result = await apiClient.importElectionResultsReportingFile({
      ...manualResultsIdentifier,
      filepath,
    });
    expect(result.err()?.type).toEqual('conversion-failed');
  });
});
