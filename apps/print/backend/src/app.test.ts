import { BatteryInfo, mockElectionPackageFileTree } from '@votingworks/backend';
import { assertDefined, err, ok } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionOpenPrimaryFixtures,
  electionPrimaryPrecinctSplitsFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';
import { HP_LASER_PRINTER_CONFIG } from '@votingworks/printing';
import {
  BallotType,
  DEFAULT_SYSTEM_SETTINGS,
  DEV_MACHINE_ID,
  ElectionDefinition,
  EncodedBallotEntry,
  LanguageCode,
  safeParseElectionDefinition,
  testCdfBallotDefinition,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
  getMockMultiLanguageElectionDefinition,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { beforeAll, beforeEach, expect, vi } from 'vitest';
import {
  apptest,
  buildBallotsForElection,
  mockElectionManagerAuth,
} from '../test/app';
import { DeviceStatuses } from './types';

const mockFeatureFlagger = getFeatureFlagMock();

let batteryInfo: BatteryInfo | null = null;

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

vi.mock(
  import('@votingworks/backend'),
  async (importActual): Promise<typeof import('@votingworks/backend')> => ({
    ...(await importActual()),
    // eslint-disable-next-line @typescript-eslint/require-await
    async getBatteryInfo(): Promise<BatteryInfo | null> {
      return batteryInfo;
    },
  })
);

// Pre-built election definitions and ballots for common test scenarios
interface SharedFixtures {
  famousNamesMultiLangElectionDefinition: ElectionDefinition;
  famousNamesMultiLangOfficialBallots: EncodedBallotEntry[];
  famousNamesMultiLangOfficialAndTestBallots: EncodedBallotEntry[];
  primaryPrecinctSplitsMultiLangElectionDefinition: ElectionDefinition;
  primaryPrecinctSplitsMultiLangOfficialBallots: EncodedBallotEntry[];
}

let sharedFixtures: SharedFixtures;

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  batteryInfo = null;
});

// Build shared fixtures once before all tests
beforeAll(async () => {
  const famousNamesMultiLangElectionDefinition =
    getMockMultiLanguageElectionDefinition(
      electionFamousNames2021Fixtures.readElectionDefinition(),
      [LanguageCode.ENGLISH]
    );

  const primaryPrecinctSplitsMultiLangElectionDefinition =
    getMockMultiLanguageElectionDefinition(
      electionPrimaryPrecinctSplitsFixtures.readElectionDefinition(),
      [LanguageCode.ENGLISH]
    );

  const [
    famousNamesMultiLangOfficialBallots,
    famousNamesMultiLangOfficialAndTestBallots,
    primaryPrecinctSplitsMultiLangOfficialBallots,
  ] = await Promise.all([
    buildBallotsForElection({
      electionDefinition: famousNamesMultiLangElectionDefinition,
      ballotModes: ['official'],
    }),
    buildBallotsForElection({
      electionDefinition: famousNamesMultiLangElectionDefinition,
      ballotModes: ['official', 'test'],
    }),
    buildBallotsForElection({
      electionDefinition: primaryPrecinctSplitsMultiLangElectionDefinition,
      ballotModes: ['official'],
    }),
  ]);

  sharedFixtures = {
    famousNamesMultiLangElectionDefinition,
    famousNamesMultiLangOfficialBallots,
    famousNamesMultiLangOfficialAndTestBallots,
    primaryPrecinctSplitsMultiLangElectionDefinition,
    primaryPrecinctSplitsMultiLangOfficialBallots,
  };
});

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

apptest('uses machine config from env', async ({ apiClient }) => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    VX_MACHINE_ID: 'test-machine-id',
    VX_CODE_VERSION: 'test-code-version',
  };

  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: 'test-machine-id',
    codeVersion: 'test-code-version',
  });

  process.env = originalEnv;
});

apptest('uses default machine config if not set', async ({ apiClient }) => {
  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: DEV_MACHINE_ID,
    codeVersion: 'dev',
  });
});

apptest(
  'getDeviceStatuses and ejectUsbDrive',
  async ({ apiClient, insertUsbDrive, removeUsbDrive }) => {
    // Start with a mounted USB drive.
    insertUsbDrive({});
    batteryInfo = { level: 0.52, discharging: true };

    const statuses = await apiClient.getDeviceStatuses();
    expect(statuses.usbDrive).toEqual(
      expect.objectContaining({ status: 'mounted' })
    );
    expect(statuses.printer).toEqual({ connected: false });
    expect(statuses.battery).toEqual({ level: 0.52, discharging: true });

    await apiClient.ejectUsbDrive();
    expect(await apiClient.getDeviceStatuses()).toMatchObject<
      Partial<DeviceStatuses>
    >({ usbDrive: { status: 'ejected' } });

    removeUsbDrive();
    expect(await apiClient.getDeviceStatuses()).toMatchObject<
      Partial<DeviceStatuses>
    >({ usbDrive: { status: 'no_drive' } });

    // Test when battery info is null (returns undefined)
    batteryInfo = null;
    const statusesNoBattery = await apiClient.getDeviceStatuses();
    expect(statusesNoBattery.battery).toBeUndefined();
  }
);

apptest(
  'configureElectionPackageFromUsb reads to and writes from store',
  async ({ apiClient, auth, logger, insertUsbDrive }) => {
    const electionDefinition =
      electionFamousNames2021Fixtures.readElectionDefinition();

    const ballotStyleId = electionDefinition.election.ballotStyles[0].id;
    const precinctId = electionDefinition.election.precincts[0].id;
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
    insertUsbDrive(
      await mockElectionPackageFileTree({
        electionDefinition,
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
  }
);

apptest(
  'configureElectionPackageFromUsb logs failure when there is an error reading from usb',
  async ({ apiClient, auth, logger, insertUsbDrive }) => {
    const electionDefinition =
      electionFamousNames2021Fixtures.readElectionDefinition();
    mockElectionManagerAuth(auth, electionDefinition);

    // Insert USB with no election package to simulate an error
    insertUsbDrive({});

    const result = await apiClient.configureElectionPackageFromUsb();
    expect(result).toEqual(err({ type: 'no_election_package' }));
    expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
      LogEventId.ElectionConfigured,
      expect.objectContaining({
        disposition: 'failure',
        message: 'Error configuring machine.',
      })
    );
  }
);

apptest(
  'configureElectionPackageFromUsb returns no_ballots error when election package has no ballots',
  async ({ apiClient, auth, logger, insertUsbDrive }) => {
    const electionDefinition =
      electionFamousNames2021Fixtures.readElectionDefinition();
    mockElectionManagerAuth(auth, electionDefinition);
    insertUsbDrive(
      await mockElectionPackageFileTree({
        electionDefinition,
        // No ballots provided
      })
    );

    const result = await apiClient.configureElectionPackageFromUsb();
    expect(result).toEqual(err({ type: 'no_ballots' }));
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.ElectionConfigured,
      expect.anything(),
      expect.objectContaining({ disposition: 'failure' })
    );
  }
);

// [TODO] Update test name after migration to Polling Places.
apptest(
  'configureElectionPackageFromUsb will automatically set precinct for single precinct election on configure',
  async ({ apiClient, auth, insertUsbDrive }) => {
    const { ENABLE_POLLING_PLACES } = BooleanEnvironmentVariableName;
    mockFeatureFlagger.enableFeatureFlag(ENABLE_POLLING_PLACES);

    const electionDefinition =
      electionTwoPartyPrimaryFixtures.makeSinglePrecinctElectionDefinition();
    const ballotStyleId = electionDefinition.election.ballotStyles[0].id;
    const precinctId = electionDefinition.election.precincts[0].id;
    const ballots: EncodedBallotEntry[] = [
      {
        ballotStyleId,
        precinctId,
        ballotType: BallotType.Precinct,
        ballotMode: 'official',
        encodedBallot: Buffer.from('mock-pdf-data-for-test').toString('base64'),
      },
    ];
    const { election } = electionDefinition;
    const defaultPollingPlace = assertDefined(election.pollingPlaces?.[0]);

    mockElectionManagerAuth(auth, electionDefinition);
    insertUsbDrive(
      await mockElectionPackageFileTree({
        electionDefinition,
        ballots,
      })
    );

    const result = await apiClient.configureElectionPackageFromUsb();
    expect(result).toEqual(ok(expect.anything()));

    expect(await apiClient.getPrecinctSelection()).toEqual(
      singlePrecinctSelectionFor(precinctId)
    );
    expect(await apiClient.getPollingPlaceId()).toEqual(defaultPollingPlace.id);
  }
);

apptest('setting precinct', async ({ apiClient, logger, configureMachine }) => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const ballots = await buildBallotsForElection({
    electionDefinition,
    ballotModes: ['official'],
  });
  expect(await apiClient.getPrecinctSelection()).toBeNull();

  await configureMachine({
    electionDefinition,
    ballots,
  });

  expect(await apiClient.getPrecinctSelection()).toBeNull();

  await apiClient.setPrecinctSelection({
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  expect(await apiClient.getPrecinctSelection()).toEqual(
    ALL_PRECINCTS_SELECTION
  );

  const precinctId = electionDefinition.election.precincts[0].id;
  const singlePrecinctSelection = singlePrecinctSelectionFor(precinctId);
  await apiClient.setPrecinctSelection({
    precinctSelection: singlePrecinctSelection,
  });
  expect(await apiClient.getPrecinctSelection()).toEqual(
    singlePrecinctSelection
  );
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.PollingPlaceChanged,
    expect.objectContaining({
      disposition: 'success',
      message: expect.stringContaining('User set the precinct for the machine'),
    })
  );
});

apptest(
  'set polling place',
  async ({ apiClient, logger, configureMachine }) => {
    const fixtures = electionFamousNames2021Fixtures;
    const electionDefinition = fixtures.readElectionDefinition();
    const ballots = await buildBallotsForElection({
      electionDefinition,
      ballotModes: ['official'],
    });

    expect(await apiClient.getPollingPlaceId()).toBeNull();

    await configureMachine({
      ballots,
      electionDefinition,
    });

    expect(await apiClient.getPollingPlaceId()).toBeNull();

    const place = assertDefined(electionDefinition.election.pollingPlaces?.[0]);
    await apiClient.setPollingPlaceId({ id: place.id });
    expect(await apiClient.getPollingPlaceId()).toEqual(place.id);

    expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
      LogEventId.PollingPlaceChanged,
      {
        disposition: 'success',
        message: `User set the polling place for the machine to ${place.name}`,
      }
    );
  }
);

apptest('mode toggling', async ({ apiClient, logger, configureMachine }) => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const ballots = await buildBallotsForElection({
    electionDefinition,
    ballotModes: ['official'],
  });
  await configureMachine({
    electionDefinition,
    ballots,
  });

  expect(await apiClient.getTestMode()).toEqual(false);

  await apiClient.setTestMode({ testMode: true });
  expect(await apiClient.getTestMode()).toEqual(true);
  expect(await apiClient.getBallots({})).toHaveLength(0);
  expect(await apiClient.getBallotPrintCounts()).toHaveLength(0);
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ToggledTestMode,
    expect.objectContaining({ disposition: 'success' })
  );

  await apiClient.setTestMode({ testMode: false });
  expect(await apiClient.getTestMode()).toEqual(false);
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ToggledTestMode,
    expect.objectContaining({ disposition: 'success' })
  );
});

apptest(
  'unconfigureMachine clears election configuration',
  async ({ apiClient, logger, workspace, configureMachine }) => {
    // Test with a cdf election for coverage
    const electionDefinition = safeParseElectionDefinition(
      JSON.stringify(testCdfBallotDefinition)
    ).unsafeUnwrap();
    const ballots = await buildBallotsForElection({
      electionDefinition,
      ballotModes: ['official'],
    });
    await configureMachine({
      electionDefinition,
      ballots,
    });

    expect(await apiClient.getElectionRecord()).not.toBeNull();

    await apiClient.setPrecinctSelection({
      precinctSelection: ALL_PRECINCTS_SELECTION,
    });
    await apiClient.setTestMode({ testMode: true });

    expect(await apiClient.getPrecinctSelection()).not.toBeNull();
    expect(await apiClient.getSystemSettings()).toEqual(
      DEFAULT_SYSTEM_SETTINGS
    );

    await apiClient.unconfigureMachine();

    expect(await apiClient.getElectionRecord()).toBeNull();
    expect(await apiClient.getPrecinctSelection()).toBeNull();
    expect(await apiClient.getBallots({})).toEqual([]);
    expect(await apiClient.getTestMode()).toEqual(false);
    expect(workspace.store.getSystemSettings()).toBeUndefined();
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.ElectionUnconfigured,
      expect.anything(),
      expect.objectContaining({ disposition: 'success' })
    );
  }
);

apptest(
  'printBallot logs when ballot is not found',
  async ({ apiClient, logger, mockPrinterHandler, configureMachine }) => {
    const {
      famousNamesMultiLangElectionDefinition,
      famousNamesMultiLangOfficialBallots,
    } = sharedFixtures;

    // Only configure official ballots so that printing in test mode will result in ballot not found
    await configureMachine({
      electionDefinition: famousNamesMultiLangElectionDefinition,
      ballots: famousNamesMultiLangOfficialBallots,
    });

    await apiClient.setPrecinctSelection({
      precinctSelection: ALL_PRECINCTS_SELECTION,
    });

    mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

    await apiClient.setTestMode({ testMode: true });

    const precinctId =
      famousNamesMultiLangElectionDefinition.election.precincts[0].id;

    // Try to print a ballot - the precinct exists but no test mode ballot is stored
    await apiClient.printBallot({
      precinctId,
      languageCode: LanguageCode.ENGLISH,
      ballotType: BallotType.Precinct,
      copies: 1,
    });

    expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
      LogEventId.PrinterPrintRequest,
      expect.objectContaining({
        disposition: 'failure',
        message: 'No ballot found',
      })
    );
  }
);

apptest(
  'end-to-end printing flow updates getBallotPrintCounts',
  async ({ apiClient, mockPrinterHandler, configureMachine }) => {
    const {
      famousNamesMultiLangElectionDefinition,
      famousNamesMultiLangOfficialBallots,
    } = sharedFixtures;

    await configureMachine({
      electionDefinition: famousNamesMultiLangElectionDefinition,
      ballots: famousNamesMultiLangOfficialBallots,
    });
    await apiClient.setPrecinctSelection({
      precinctSelection: ALL_PRECINCTS_SELECTION,
    });
    mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

    const { ballotStyles } = famousNamesMultiLangElectionDefinition.election;
    const styleA = ballotStyles[0];
    const styleB = ballotStyles[1];
    const precinctA = styleA.precincts[0];
    const precinctB = styleB.precincts[0];

    await apiClient.printBallot({
      precinctId: precinctA,
      languageCode: LanguageCode.ENGLISH,
      ballotType: BallotType.Precinct,
      copies: 2,
    });
    await apiClient.printBallot({
      precinctId: precinctA,
      languageCode: LanguageCode.ENGLISH,
      ballotType: BallotType.Absentee,
      copies: 1,
    });
    await apiClient.printBallot({
      precinctId: precinctB,
      languageCode: LanguageCode.ENGLISH,
      ballotType: BallotType.Precinct,
      copies: 1,
    });

    const counts = await apiClient.getBallotPrintCounts();
    const rowA = counts.find(
      (c) => c.ballotStyleId === styleA.id && c.precinctId === precinctA
    );
    const rowB = counts.find(
      (c) => c.ballotStyleId === styleB.id && c.precinctId === precinctB
    );

    expect(rowA).toMatchObject({
      ballotStyleId: styleA.id,
      precinctId: precinctA,
      precinctCount: 2,
      absenteeCount: 1,
      totalCount: 3,
      languageCode: LanguageCode.ENGLISH,
    });
    expect(rowB).toMatchObject({
      ballotStyleId: styleB.id,
      precinctId: precinctB,
      precinctCount: 1,
      absenteeCount: 0,
      totalCount: 1,
      languageCode: LanguageCode.ENGLISH,
    });
  }
);

apptest(
  'end-to-end printing flow updates getBallotPrintCounts for primary election',
  async ({ apiClient, mockPrinterHandler, configureMachine }) => {
    const electionDefinition = getMockMultiLanguageElectionDefinition(
      electionTwoPartyPrimaryFixtures.readElectionDefinition(),
      [LanguageCode.ENGLISH]
    );

    const ballots = await buildBallotsForElection({
      electionDefinition,
      ballotModes: ['official'],
    });
    await configureMachine({
      electionDefinition,
      ballots,
    });
    await apiClient.setPrecinctSelection({
      precinctSelection: ALL_PRECINCTS_SELECTION,
    });
    mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

    const { ballotStyles, parties } = electionDefinition.election;
    // Get two ballot styles from different parties
    const mammalParty = parties.find((p) => p.name === 'Mammal')!;
    const fishParty = parties.find((p) => p.name === 'Fish')!;

    const mammalStyle = ballotStyles.find(
      (bs) => bs.partyId === mammalParty.id
    )!;
    const fishStyle = ballotStyles.find((bs) => bs.partyId === fishParty.id)!;
    const mammalPrecinctId = mammalStyle.precincts[0];
    const fishPrecinctId = fishStyle.precincts[0];

    // Print ballots for both parties
    await apiClient.printBallot({
      precinctId: mammalPrecinctId,
      partyId: mammalParty.id,
      languageCode: LanguageCode.ENGLISH,
      ballotType: BallotType.Precinct,
      copies: 2,
    });
    await apiClient.printBallot({
      precinctId: fishPrecinctId,
      partyId: fishParty.id,
      languageCode: LanguageCode.ENGLISH,
      ballotType: BallotType.Absentee,
      copies: 1,
    });

    const counts = await apiClient.getBallotPrintCounts();
    const mammalRow = counts.find(
      (c) =>
        c.ballotStyleId === mammalStyle.id && c.precinctId === mammalPrecinctId
    );
    const fishRow = counts.find(
      (c) => c.ballotStyleId === fishStyle.id && c.precinctId === fishPrecinctId
    );

    expect(mammalRow).toMatchObject({
      ballotStyleId: mammalStyle.id,
      precinctId: mammalPrecinctId,
      precinctCount: 2,
      absenteeCount: 0,
      totalCount: 2,
      languageCode: LanguageCode.ENGLISH,
      partyName: 'Mammal',
    });
    expect(fishRow).toMatchObject({
      ballotStyleId: fishStyle.id,
      precinctId: fishPrecinctId,
      precinctCount: 0,
      absenteeCount: 1,
      totalCount: 1,
      languageCode: LanguageCode.ENGLISH,
      partyName: 'Fish',
    });
  }
);

apptest(
  'end-to-end printing flow handles open primary (consolidated ballots)',
  async ({ apiClient, mockPrinterHandler, configureMachine }) => {
    // In an open primary, ballots are consolidated (all parties' contests on one
    // ballot) and ballot styles have no partyId. VxPrint should print without a
    // party selection, just like a general election.
    const electionDefinition = getMockMultiLanguageElectionDefinition(
      electionOpenPrimaryFixtures.readElectionDefinition(),
      [LanguageCode.ENGLISH]
    );

    const ballots = await buildBallotsForElection({
      electionDefinition,
      ballotModes: ['official'],
    });
    await configureMachine({
      electionDefinition,
      ballots,
    });
    await apiClient.setPrecinctSelection({
      precinctSelection: ALL_PRECINCTS_SELECTION,
    });
    mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

    const { ballotStyles } = electionDefinition.election;
    const ballotStyle = ballotStyles[0];
    const precinctId = ballotStyle.precincts[0];

    // Print with no partyId, matching what the frontend sends for open primaries.
    await apiClient.printBallot({
      precinctId,
      languageCode: LanguageCode.ENGLISH,
      ballotType: BallotType.Precinct,
      copies: 2,
    });

    const counts = await apiClient.getBallotPrintCounts();
    const row = counts.find(
      (c) => c.ballotStyleId === ballotStyle.id && c.precinctId === precinctId
    );
    expect(row).toMatchObject({
      ballotStyleId: ballotStyle.id,
      precinctId,
      precinctCount: 2,
      absenteeCount: 0,
      totalCount: 2,
      languageCode: LanguageCode.ENGLISH,
      partyName: undefined,
    });
  }
);

apptest(
  'printAllBallotStyles works for open primary (consolidated ballots)',
  async ({ apiClient, mockPrinterHandler, configureMachine }) => {
    const electionDefinition = getMockMultiLanguageElectionDefinition(
      electionOpenPrimaryFixtures.readElectionDefinition(),
      [LanguageCode.ENGLISH]
    );

    const ballots = await buildBallotsForElection({
      electionDefinition,
      ballotModes: ['official'],
    });
    await configureMachine({
      electionDefinition,
      ballots,
    });
    mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

    await apiClient.printAllBallotStyles({
      languageCode: LanguageCode.ENGLISH,
      ballotType: BallotType.Precinct,
      copiesPerStyle: 1,
    });

    const counts = await apiClient.getBallotPrintCounts();
    expect(counts.length).toEqual(
      electionDefinition.election.ballotStyles.length
    );
    for (const count of counts) {
      expect(count.partyName).toBeUndefined();
      expect(count.totalCount).toEqual(1);
    }
  }
);

apptest(
  'end-to-end printing flow handles precinct splits correctly',
  async ({ apiClient, mockPrinterHandler, configureMachine }) => {
    // Use election with precinct splits - Precinct 4 has two splits
    const {
      primaryPrecinctSplitsMultiLangElectionDefinition,
      primaryPrecinctSplitsMultiLangOfficialBallots,
    } = sharedFixtures;

    await configureMachine({
      electionDefinition: primaryPrecinctSplitsMultiLangElectionDefinition,
      ballots: primaryPrecinctSplitsMultiLangOfficialBallots,
    });
    await apiClient.setPrecinctSelection({
      precinctSelection: ALL_PRECINCTS_SELECTION,
    });
    mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

    const { parties } =
      primaryPrecinctSplitsMultiLangElectionDefinition.election;
    const mammalParty = parties.find((p) => p.name === 'Mammal')!;

    // Print a ballot for the precinct with splits (precinct-c2)
    // Using splitId to target a specific split
    await apiClient.printBallot({
      precinctId: 'precinct-c2',
      splitId: 'precinct-c2-split-1',
      partyId: mammalParty.id,
      languageCode: LanguageCode.ENGLISH,
      ballotType: BallotType.Precinct,
      copies: 1,
    });

    const counts = await apiClient.getBallotPrintCounts();

    // Find the row for the split - should have combined precinct/split name
    const splitRow = counts.find(
      (c) =>
        c.precinctId === 'precinct-c2' &&
        c.precinctOrSplitName.includes('Split 1')
    );

    expect(splitRow).toBeDefined();
    expect(splitRow).toMatchObject({
      precinctId: 'precinct-c2',
      precinctCount: 1,
      absenteeCount: 0,
      totalCount: 1,
      languageCode: LanguageCode.ENGLISH,
      partyName: 'Mammal',
    });
    // Verify the split name format: "Precinct Name - Split Name"
    expect(splitRow!.precinctOrSplitName).toMatch(/Precinct 4 - Split 1/);
  }
);

async function expectPrintedJobsMatchBallotsInOrder({
  ballots,
  printJobHistoryPaths,
}: {
  ballots: ReadonlyArray<{ encodedBallot: string }>;
  printJobHistoryPaths: readonly string[];
}): Promise<void> {
  const expectedHashes = ballots.map((b) =>
    sha256(Buffer.from(b.encodedBallot, 'base64'))
  );
  const actualHashes = await Promise.all(
    printJobHistoryPaths.map(async (p) => sha256(await readFile(p)))
  );
  expect(actualHashes).toEqual(expectedHashes);
}

apptest(
  'printAllBallotStyles prints every style and updates counts in a stable order',
  async ({ apiClient, mockPrinterHandler, configureMachine }) => {
    // Use primary election to cover party name sorting logic
    const {
      primaryPrecinctSplitsMultiLangElectionDefinition,
      primaryPrecinctSplitsMultiLangOfficialBallots,
    } = sharedFixtures;

    await configureMachine({
      electionDefinition: primaryPrecinctSplitsMultiLangElectionDefinition,
      ballots: primaryPrecinctSplitsMultiLangOfficialBallots,
    });
    mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

    const initialCounts = await apiClient.getBallotPrintCounts();
    expect(initialCounts.length).toBeGreaterThan(0);
    expect(initialCounts.every((c) => c.totalCount === 0)).toEqual(true);

    const ballotOrder = new Map<string, number>();
    const sortedCounts = [...initialCounts].sort((a, b) => {
      if (a.precinctOrSplitName !== b.precinctOrSplitName) {
        return a.precinctOrSplitName.localeCompare(b.precinctOrSplitName);
      }
      if (a.partyName && b.partyName) {
        return a.partyName.localeCompare(b.partyName);
      }
      return 0;
    });
    for (let i = 0; i < sortedCounts.length; i += 1) {
      const c = sortedCounts[i];
      ballotOrder.set(`${c.precinctId}-${c.ballotStyleId}`, i);
    }

    const allPrecinctBallots = (
      await apiClient.getBallots({
        ballotType: BallotType.Precinct,
        languageCode: LanguageCode.ENGLISH,
      })
    )
      .slice()
      .sort(
        (a, b) =>
          assertDefined(ballotOrder.get(`${a.precinctId}-${a.ballotStyleId}`)) -
          assertDefined(ballotOrder.get(`${b.precinctId}-${b.ballotStyleId}`))
      );

    const jobsBeforePrecinct = mockPrinterHandler.getPrintJobHistory().length;
    await apiClient.printAllBallotStyles({
      languageCode: LanguageCode.ENGLISH,
      ballotType: BallotType.Precinct,
      copiesPerStyle: 1,
    });
    const jobsAfterPrecinct = mockPrinterHandler.getPrintJobHistory().length;
    expect(jobsAfterPrecinct - jobsBeforePrecinct).toEqual(
      allPrecinctBallots.length
    );

    await expectPrintedJobsMatchBallotsInOrder({
      ballots: allPrecinctBallots,
      printJobHistoryPaths: mockPrinterHandler
        .getPrintJobHistory()
        .slice(jobsBeforePrecinct, jobsAfterPrecinct)
        .map((j) => j.filename),
    });

    const countsAfterPrecinct = await apiClient.getBallotPrintCounts();
    for (const c of countsAfterPrecinct) {
      expect(c.precinctCount).toEqual(1);
      expect(c.absenteeCount).toEqual(0);
      expect(c.totalCount).toEqual(1);
    }

    const allAbsenteeBallots = (
      await apiClient.getBallots({
        ballotType: BallotType.Absentee,
        languageCode: LanguageCode.ENGLISH,
      })
    )
      .slice()
      .sort(
        (a, b) =>
          assertDefined(ballotOrder.get(`${a.precinctId}-${a.ballotStyleId}`)) -
          assertDefined(ballotOrder.get(`${b.precinctId}-${b.ballotStyleId}`))
      );

    const jobsBeforeAbsentee = mockPrinterHandler.getPrintJobHistory().length;
    await apiClient.printAllBallotStyles({
      languageCode: LanguageCode.ENGLISH,
      ballotType: BallotType.Absentee,
      copiesPerStyle: 2,
    });
    const jobsAfterAbsentee = mockPrinterHandler.getPrintJobHistory().length;
    expect(jobsAfterAbsentee - jobsBeforeAbsentee).toEqual(
      allAbsenteeBallots.length
    );

    await expectPrintedJobsMatchBallotsInOrder({
      ballots: allAbsenteeBallots,
      printJobHistoryPaths: mockPrinterHandler
        .getPrintJobHistory()
        .slice(jobsBeforeAbsentee, jobsAfterAbsentee)
        .map((j) => j.filename),
    });

    const countsAfterAbsentee = await apiClient.getBallotPrintCounts();
    for (const c of countsAfterAbsentee) {
      expect(c.precinctCount).toEqual(1);
      expect(c.absenteeCount).toEqual(2);
      expect(c.totalCount).toEqual(3);
    }
  }
);

apptest(
  'getDistinctBallotStylesCount returns correct counts in official and test modes',
  async ({ apiClient, configureMachine }) => {
    const {
      famousNamesMultiLangElectionDefinition,
      famousNamesMultiLangOfficialAndTestBallots,
    } = sharedFixtures;

    await configureMachine({
      electionDefinition: famousNamesMultiLangElectionDefinition,
      ballots: famousNamesMultiLangOfficialAndTestBallots,
    });

    expect(
      await apiClient.getDistinctBallotStylesCount({
        ballotType: BallotType.Precinct,
        languageCode: LanguageCode.ENGLISH,
      })
    ).toEqual(
      famousNamesMultiLangElectionDefinition.election.ballotStyles.length
    );

    await apiClient.setTestMode({ testMode: true });
    expect(
      await apiClient.getDistinctBallotStylesCount({
        ballotType: BallotType.Precinct,
        languageCode: LanguageCode.ENGLISH,
      })
    ).toEqual(
      famousNamesMultiLangElectionDefinition.election.ballotStyles.length
    );
  }
);
