import { mockElectionPackageFileTree } from '@votingworks/backend';
import { err } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireTestBallotFixtures,
  readElectionGeneralDefinition,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { LogEventId } from '@votingworks/logging';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  anyPollingPlace,
  BallotMetadata,
  BallotType,
  convertVxfElectionToCdfBallotDefinition,
  DEV_MACHINE_ID,
  InterpretedHmpbPage,
  PageInterpretationWithFiles,
  safeParseElectionDefinition,
  SheetOf,
  TEST_JURISDICTION,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { randomUUID as uuid } from 'node:crypto';
import { beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { mockElectionManagerAuth } from '../test/helpers/auth';
import { withApp } from '../test/helpers/setup_app';
import { generateHmpbFixture } from '../test/helpers/ballots';

const electionGeneralDefinition = readElectionGeneralDefinition();
const electionGeneral = electionGeneralDefinition.election;
const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();

const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

const jurisdiction = TEST_JURISDICTION;

// The famous names fixture defines polling places, including a single absentee
// "Central Scanning" location (id 'central-scanning') covering all precincts.
const famousNamesDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();

let frontImagePath: string;
let backImagePath: string;
let sheet: SheetOf<PageInterpretationWithFiles>;

beforeAll(async () => {
  const hmpbFixture = await generateHmpbFixture();
  [frontImagePath, backImagePath] = hmpbFixture.sheet;
  sheet = (() => {
    const metadata: BallotMetadata = {
      ballotHash: vxFamousNamesFixtures.electionDefinition.ballotHash,
      ballotType: BallotType.Precinct,
      ballotStyleId: '12',
      precinctId: '23',
      isTestMode: false,
    };
    return [
      {
        imagePath: frontImagePath,
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            ...metadata,
            pageNumber: 1,
          },
          votes: {},
          markInfo: {
            ballotSize: { width: 0, height: 0 },
            marks: [],
          },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            enabledReasonInfos: [],
            ignoredReasonInfos: [],
          },
          layout: {
            pageSize: { width: 0, height: 0 },
            metadata: {
              ...metadata,
              pageNumber: 1,
            },
            contests: [],
          },
        },
      },
      {
        imagePath: backImagePath,
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            ...metadata,
            pageNumber: 2,
          },
          votes: {},
          markInfo: {
            ballotSize: { width: 0, height: 0 },
            marks: [],
          },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            enabledReasonInfos: [],
            ignoredReasonInfos: [],
          },
          layout: {
            pageSize: { width: 0, height: 0 },
            metadata: {
              ...metadata,
              pageNumber: 2,
            },
            contests: [],
          },
        },
      },
    ];
  })();
});

beforeEach(() => {
  vi.clearAllMocks();
  featureFlagMock.resetFeatureFlags();
});

test('getElectionDefinition', async () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  const electionPackageHash = 'test-election-package-hash';
  await withApp(async ({ apiClient, importer, store }) => {
    expect(await apiClient.getElectionRecord()).toEqual(null);

    importer.configure(electionDefinition, jurisdiction, electionPackageHash);
    store.setPollingPlaceId(anyPollingPlace(electionDefinition.election).id);

    expect(await apiClient.getElectionRecord()).toEqual({
      electionDefinition,
      electionPackageHash,
    });

    await importer.unconfigure();
    expect(await apiClient.getElectionRecord()).toEqual(null);
  });
});

test('unconfigure', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();

  await withApp(async ({ apiClient, importer, store, logger }) => {
    importer.configure(
      electionDefinition,
      jurisdiction,
      'test-election-package-hash'
    );
    store.setPollingPlaceId(anyPollingPlace(electionDefinition.election).id);
    await apiClient.setTestMode({ testMode: false });

    const batchId = store.addBatch();
    store.addSheet(electionDefinition.election, uuid(), batchId, sheet);
    store.finishBatch({ batchId });
    expect(store.getBallotsCounted()).toEqual(1);

    await suppressingConsoleOutput(async () => {
      await expect(apiClient.unconfigure()).rejects.toThrow();
    });
    expect(store.getBallotsCounted()).toEqual(1);

    // should succeed once we mock a backup
    store.setScannerBackedUp(true);
    await apiClient.unconfigure();
    expect(store.getBallotsCounted()).toEqual(0);
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.ElectionUnconfigured,
      'unknown',
      {
        disposition: 'success',
        message:
          'User successfully unconfigured the machine to remove the current election and all current ballot data.',
      }
    );
  });
});

test('unconfigure w/ ignoreBackupRequirement', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();

  await withApp(async ({ apiClient, importer, store }) => {
    importer.configure(
      electionDefinition,
      jurisdiction,
      'test-election-package-hash'
    );
    store.setPollingPlaceId(anyPollingPlace(electionDefinition.election).id);
    await apiClient.setTestMode({ testMode: false });

    const batchId = store.addBatch();
    store.addSheet(electionDefinition.election, uuid(), batchId, sheet);
    store.finishBatch({ batchId });
    expect(store.getBallotsCounted()).toEqual(1);

    await apiClient.unconfigure({
      ignoreBackupRequirement: true,
    });
    expect(store.getBallotsCounted()).toEqual(0);
  });
});

test('clearing scanning data', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();

  await withApp(async ({ apiClient, importer, store, logger }) => {
    importer.configure(
      electionDefinition,
      jurisdiction,
      'test-election-package-hash'
    );
    store.setPollingPlaceId(anyPollingPlace(electionDefinition.election).id);
    await apiClient.setTestMode({ testMode: false });

    const batchId = store.addBatch();
    store.addSheet(electionDefinition.election, uuid(), batchId, sheet);
    store.finishBatch({ batchId });
    expect(store.getBallotsCounted()).toEqual(1);

    await suppressingConsoleOutput(async () => {
      await expect(apiClient.clearBallotData()).rejects.toThrow();
    });
    expect(store.getBallotsCounted()).toEqual(1);

    // should succeed once we mock a backup
    store.setScannerBackedUp(true);
    await apiClient.clearBallotData();
    expect(store.getBallotsCounted()).toEqual(0);
    expect(logger.log).toHaveBeenNthCalledWith(
      5,
      LogEventId.ClearingBallotData,
      'unknown',
      {
        message: 'Removing all ballot data...',
      }
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      6,
      LogEventId.ClearedBallotData,
      'unknown',
      {
        disposition: 'success',
        message: 'Successfully cleared all ballot data.',
      }
    );
  });
});

test('getting / setting test mode', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();

  await withApp(async ({ apiClient, importer, store }) => {
    importer.configure(
      electionDefinition,
      jurisdiction,
      'test-election-package-hash'
    );
    store.setPollingPlaceId(anyPollingPlace(electionDefinition.election).id);

    expect(await apiClient.getTestMode()).toEqual(true);

    await apiClient.setTestMode({ testMode: false });
    expect(await apiClient.getTestMode()).toEqual(false);

    const batchId = store.addBatch();
    store.addSheet(electionDefinition.election, uuid(), batchId, sheet);
    store.finishBatch({ batchId });
    expect(store.getBallotsCounted()).toEqual(1);

    // setting test mode should also clear ballot data
    await apiClient.setTestMode({ testMode: true });
    expect(await apiClient.getTestMode()).toEqual(true);
    expect(store.getBallotsCounted()).toEqual(0);
  });
});

test('usbDrive', async () => {
  await withApp(async ({ apiClient, mockUsbDrive }) => {
    const { usbDrive } = mockUsbDrive;

    usbDrive.status.expectCallWith().resolves({ status: 'no_drive' });
    expect(await apiClient.getUsbDriveStatus()).toEqual({
      status: 'no_drive',
    });

    usbDrive.eject.expectCallWith().resolves();
    await apiClient.ejectUsbDrive();
  });
});

test('uses machine config from env', async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    VX_MACHINE_ID: 'test-machine-id',
    VX_CODE_VERSION: 'test-code-version',
  };

  await withApp(async ({ apiClient }) => {
    expect(await apiClient.getMachineConfig()).toEqual({
      machineId: 'test-machine-id',
      codeVersion: 'test-code-version',
    });
  });

  process.env = originalEnv;
});

test('uses default machine config if not set', async () => {
  await withApp(async ({ apiClient }) => {
    expect(await apiClient.getMachineConfig()).toEqual({
      machineId: DEV_MACHINE_ID,
      codeVersion: 'dev',
    });
  });
});

test('configure with CDF election', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  await withApp(async ({ apiClient, auth, mockUsbDrive, logger }) => {
    const cdfElection =
      convertVxfElectionToCdfBallotDefinition(electionGeneral);
    const cdfElectionDefinition = safeParseElectionDefinition(
      JSON.stringify(cdfElection)
    ).unsafeUnwrap();
    mockElectionManagerAuth(auth, cdfElectionDefinition);
    mockUsbDrive.insertUsbDrive(
      await mockElectionPackageFileTree({
        electionDefinition: cdfElectionDefinition,
      })
    );

    (await apiClient.configureFromElectionPackageOnUsbDrive()).unsafeUnwrap();

    const electionRecord = await apiClient.getElectionRecord();
    expect(electionRecord?.electionDefinition.election.id).toEqual(
      electionGeneral.id
    );
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.ElectionConfigured,
      'election_manager',
      {
        disposition: 'success',
        ballotHash: cdfElectionDefinition.ballotHash,
        message: expect.any(String),
      }
    );

    // Ensure loading auth election key from db works
    expect(await apiClient.getAuthStatus()).toMatchObject({
      status: 'logged_in',
    });
  });
});

test('get/set polling place id', async () => {
  await withApp(async ({ apiClient, auth, importer, store, logger }) => {
    mockElectionManagerAuth(auth, famousNamesDefinition);
    importer.configure(
      famousNamesDefinition,
      jurisdiction,
      'test-election-package-hash'
    );

    // No polling place selected initially (importer.configure does not
    // auto-select; only the configure-from-USB API does).
    expect(await apiClient.getPollingPlaceId()).toEqual(null);

    await apiClient.setPollingPlaceId({ id: 'central-scanning' });
    expect(await apiClient.getPollingPlaceId()).toEqual('central-scanning');
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.PollingPlaceChanged,
      'election_manager',
      {
        disposition: 'success',
        message: expect.stringContaining('Central Scanning'),
      }
    );

    // Setting an unknown polling place id throws.
    await suppressingConsoleOutput(async () => {
      await expect(
        apiClient.setPollingPlaceId({ id: 'nonexistent' })
      ).rejects.toThrow();
    });

    // Cannot change the polling place once scanning has begun.
    store.addBatch();
    await suppressingConsoleOutput(async () => {
      await expect(
        apiClient.setPollingPlaceId({ id: 'central-scanning' })
      ).rejects.toThrow(
        'Attempt to change polling place after scanning has begun'
      );
    });
  });
});

test('configure auto-selects the single absentee polling place', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  await withApp(async ({ apiClient, auth, mockUsbDrive }) => {
    mockElectionManagerAuth(auth, famousNamesDefinition);
    mockUsbDrive.insertUsbDrive(
      await mockElectionPackageFileTree({
        electionDefinition: famousNamesDefinition,
      })
    );

    (await apiClient.configureFromElectionPackageOnUsbDrive()).unsafeUnwrap();

    expect(await apiClient.getPollingPlaceId()).toEqual('central-scanning');
  });
});

test('configure does not auto-select when there are multiple absentee polling places', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  const electionDefinition = safeParseElectionDefinition(
    JSON.stringify({
      ...famousNamesDefinition.election,
      pollingPlaces: [
        ...(famousNamesDefinition.election.pollingPlaces ?? []),
        {
          id: 'central-scanning-2',
          name: 'Central Scanning 2',
          precincts: { '20': { type: 'whole' } },
          type: 'absentee',
        },
      ],
    })
  ).unsafeUnwrap();

  await withApp(async ({ apiClient, auth, mockUsbDrive }) => {
    mockElectionManagerAuth(auth, electionDefinition);
    mockUsbDrive.insertUsbDrive(
      await mockElectionPackageFileTree({ electionDefinition })
    );

    (await apiClient.configureFromElectionPackageOnUsbDrive()).unsafeUnwrap();

    expect(await apiClient.getPollingPlaceId()).toEqual(null);
  });
});

test('configure does not auto-select when there are no absentee polling places', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  // The two-party primary fixture has no absentee polling places.
  const electionDefinition = electionTwoPartyPrimaryDefinition;

  await withApp(async ({ apiClient, auth, mockUsbDrive }) => {
    mockElectionManagerAuth(auth, electionDefinition);
    mockUsbDrive.insertUsbDrive(
      await mockElectionPackageFileTree({ electionDefinition })
    );

    (await apiClient.configureFromElectionPackageOnUsbDrive()).unsafeUnwrap();

    expect(await apiClient.getPollingPlaceId()).toEqual(null);
  });
});

test('configure with invalid file', async () => {
  // Skip signature authentication so the election key mismatch is reached.
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
  await withApp(async ({ apiClient, auth, mockUsbDrive, logger }) => {
    mockElectionManagerAuth(auth, electionGeneralDefinition);
    mockUsbDrive.insertUsbDrive(
      await mockElectionPackageFileTree({
        electionDefinition: electionTwoPartyPrimaryDefinition,
      })
    );

    expect(await apiClient.configureFromElectionPackageOnUsbDrive()).toEqual(
      err({ type: 'election_key_mismatch' })
    );
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.ElectionConfigured,
      'election_manager',
      expect.objectContaining({
        disposition: 'failure',
      })
    );
  });
});

test('get next sheet returns null when no adjudication sheet', async () => {
  await withApp(async ({ apiClient }) => {
    expect(await apiClient.getNextReviewSheet()).toBeNull();
  });
});

test('getNextReviewSheet returns interpretation and image data for uninterpretable sheets', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();

  await withApp(async ({ apiClient, importer, store, workspace }) => {
    importer.configure(
      electionDefinition,
      jurisdiction,
      'test-election-package-hash'
    );
    store.setPollingPlaceId(anyPollingPlace(electionDefinition.election).id);

    const batchId = workspace.store.addBatch();
    workspace.store.addSheet(electionDefinition.election, uuid(), batchId, [
      { imagePath: frontImagePath, interpretation: { type: 'BlankPage' } },
      { imagePath: backImagePath, interpretation: { type: 'BlankPage' } },
    ]);
    workspace.store.finishBatch({ batchId });

    const result = await apiClient.getNextReviewSheet();
    expect(result).toBeDefined();
    expect(result!.sheetInterpretation).toEqual({
      type: 'InvalidSheet',
      reason: { type: 'unknown' },
    });

    const [frontImage, backImage] = result!.images;
    for (const image of [frontImage, backImage]) {
      expect(image).toMatchObject({
        imageUrl: expect.stringMatching(/^data:image\//),
        ballotBounds: {
          x: 0,
          y: 0,
          width: expect.any(Number),
          height: expect.any(Number),
        },
      });
    }
    expect(frontImage.layout).toBeUndefined();
    expect(backImage.layout).toBeUndefined();
  });
});

test('getNextReviewSheet returns interpretation, image data, and layouts for interpretable sheets', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();

  await withApp(async ({ apiClient, importer, store, workspace }) => {
    importer.configure(
      electionDefinition,
      jurisdiction,
      'test-election-package-hash'
    );
    store.setPollingPlaceId(anyPollingPlace(electionDefinition.election).id);

    const batchId = workspace.store.addBatch();

    const metadata: BallotMetadata = {
      ballotHash: electionDefinition.ballotHash,
      ballotType: BallotType.Precinct,
      ballotStyleId: 'card-number-3',
      precinctId: 'town-id-00701-precinct-id-default',
      isTestMode: false,
    };
    function buildHmpbPage(
      pageNumber: number,
      reasonInfos: AdjudicationReasonInfo[] = []
    ): InterpretedHmpbPage {
      return {
        type: 'InterpretedHmpbPage',
        metadata: { ...metadata, pageNumber },
        markInfo: { ballotSize: { width: 1, height: 1 }, marks: [] },
        adjudicationInfo: {
          requiresAdjudication: reasonInfos.length > 0,
          enabledReasons: reasonInfos.map((r) => r.type),
          enabledReasonInfos: reasonInfos,
          ignoredReasonInfos: [],
        },
        votes: {},
        layout: {
          pageSize: { width: 1, height: 1 },
          metadata: { ...metadata, pageNumber },
          contests: [],
        },
      };
    }
    const overvoteReason: AdjudicationReasonInfo = {
      type: AdjudicationReason.Overvote,
      contestId: 'contest-id',
      expected: 1,
      optionIds: ['option-id', 'option-id-2'],
    };
    const frontPage = buildHmpbPage(1, [overvoteReason]);
    const backPage = buildHmpbPage(2);

    workspace.store.addSheet(electionDefinition.election, uuid(), batchId, [
      { imagePath: frontImagePath, interpretation: frontPage },
      { imagePath: backImagePath, interpretation: backPage },
    ]);
    workspace.store.finishBatch({ batchId });

    const result = await apiClient.getNextReviewSheet();
    expect(result!.sheetInterpretation).toEqual({
      type: 'NeedsReviewSheet',
      reasons: [overvoteReason],
    });
    const [frontImage, backImage] = result!.images;
    expect(frontImage.layout).toEqual(frontPage.layout);
    expect(backImage.layout).toEqual(backPage.layout);
  });
});
