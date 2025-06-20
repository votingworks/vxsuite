import { mockElectionPackageFileTree } from '@votingworks/backend';
import { err } from '@votingworks/basics';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  readElectionGeneralDefinition,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { LogEventId } from '@votingworks/logging';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import {
  AdjudicationReason,
  BallotMetadata,
  BallotStyleId,
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
import { readFile } from 'node:fs/promises';
import { v4 as uuid } from 'uuid';
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
      ballotStyleId: '12' as BallotStyleId,
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
});

test('getElectionDefinition', async () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  const electionPackageHash = 'test-election-package-hash';
  await withApp(async ({ apiClient, importer }) => {
    expect(await apiClient.getElectionRecord()).toEqual(null);

    importer.configure(electionDefinition, jurisdiction, electionPackageHash);

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
    await apiClient.setTestMode({ testMode: false });

    const batchId = store.addBatch();
    store.addSheet(uuid(), batchId, sheet);
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
    expect(logger.log).toHaveBeenLastCalledWith(
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
    await apiClient.setTestMode({ testMode: false });

    const batchId = store.addBatch();
    store.addSheet(uuid(), batchId, sheet);
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
    await apiClient.setTestMode({ testMode: false });

    const batchId = store.addBatch();
    store.addSheet(uuid(), batchId, sheet);
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
      4,
      LogEventId.ClearingBallotData,
      'unknown',
      {
        message: 'Removing all ballot data...',
      }
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      5,
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

    expect(await apiClient.getTestMode()).toEqual(true);

    await apiClient.setTestMode({ testMode: false });
    expect(await apiClient.getTestMode()).toEqual(false);

    const batchId = store.addBatch();
    store.addSheet(uuid(), batchId, sheet);
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
    expect(logger.log).toHaveBeenLastCalledWith(
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

test('configure with invalid file', async () => {
  await withApp(async ({ apiClient, auth, mockUsbDrive, logger }) => {
    mockElectionManagerAuth(auth, electionGeneralDefinition);
    mockUsbDrive.insertUsbDrive(
      await mockElectionPackageFileTree({
        electionDefinition: electionTwoPartyPrimaryDefinition,
      })
    );

    expect(await apiClient.configureFromElectionPackageOnUsbDrive()).toEqual(
      err('election_key_mismatch')
    );
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.ElectionConfigured,
      'election_manager',
      expect.objectContaining({
        disposition: 'failure',
      })
    );
  });
});

test('get next sheet', async () => {
  await withApp(async ({ apiClient, workspace }) => {
    vi.spyOn(workspace.store, 'getNextAdjudicationSheet').mockReturnValueOnce({
      id: 'mock-review-sheet',
      front: {
        interpretation: { type: 'BlankPage' },
      },
      back: {
        interpretation: { type: 'BlankPage' },
      },
    });

    expect(await apiClient.getNextReviewSheet()).toEqual({
      interpreted: {
        id: 'mock-review-sheet',
        front: {
          interpretation: { type: 'BlankPage' },
        },
        back: {
          interpretation: { type: 'BlankPage' },
        },
      },
      layouts: {},
      definitions: {},
    });
  });
});

test('get next sheet layouts', async () => {
  await withApp(async ({ apiClient, workspace }) => {
    const metadata: BallotMetadata = {
      ballotHash: 'abcdef',
      ballotType: BallotType.Precinct,
      ballotStyleId: 'card-number-3' as BallotStyleId,
      precinctId: 'town-id-00701-precinct-id-default',
      isTestMode: false,
    };
    const frontInterpretation: InterpretedHmpbPage = {
      type: 'InterpretedHmpbPage',
      metadata: {
        ...metadata,
        pageNumber: 1,
      },
      markInfo: {
        ballotSize: { width: 1, height: 1 },
        marks: [],
      },
      adjudicationInfo: {
        requiresAdjudication: true,
        enabledReasons: [AdjudicationReason.Overvote],
        enabledReasonInfos: [
          {
            type: AdjudicationReason.Overvote,
            contestId: 'contest-id',
            expected: 1,
            optionIds: ['option-id', 'option-id-2'],
          },
        ],
        ignoredReasonInfos: [],
      },
      votes: {},
      layout: {
        pageSize: { width: 1, height: 1 },
        metadata: {
          ...metadata,
          pageNumber: 1,
        },
        contests: [],
      },
    };
    const backInterpretation: InterpretedHmpbPage = {
      ...frontInterpretation,
      metadata: {
        ...frontInterpretation.metadata,
        pageNumber: 2,
      },
    };
    vi.spyOn(workspace.store, 'getNextAdjudicationSheet').mockReturnValueOnce({
      id: 'mock-review-sheet',
      front: {
        interpretation: frontInterpretation,
      },
      back: {
        interpretation: backInterpretation,
      },
    });

    expect(await apiClient.getNextReviewSheet()).toEqual({
      interpreted: {
        id: 'mock-review-sheet',
        front: {
          interpretation: frontInterpretation,
        },
        back: {
          interpretation: backInterpretation,
        },
      },
      layouts: {
        front: frontInterpretation.layout,
        back: backInterpretation.layout,
      },
      definitions: {
        front: { contestIds: expect.any(Array) },
        back: { contestIds: expect.any(Array) },
      },
    });
  });
});

test('getSheetImage with a real sheet ID', async () => {
  await withApp(async ({ apiClient, workspace }) => {
    const batchId = workspace.store.addBatch();
    const sheetId = workspace.store.addSheet(uuid(), batchId, sheet);
    workspace.store.finishBatch({ batchId });

    expect(await apiClient.getSheetImage({ sheetId, side: 'front' })).toEqual(
      await readFile(frontImagePath)
    );
    expect(await apiClient.getSheetImage({ sheetId, side: 'back' })).toEqual(
      await readFile(backImagePath)
    );
  });
});

test('getSheetImage with a fake sheet ID', async () => {
  await withApp(async ({ apiClient }) => {
    expect(
      await apiClient.getSheetImage({
        sheetId: 'not a real sheet ID',
        side: 'front',
      })
    ).toBeNull();
  });
});
