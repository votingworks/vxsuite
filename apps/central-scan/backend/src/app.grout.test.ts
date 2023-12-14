import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import {
  BallotMetadata,
  BallotType,
  PageInterpretationWithFiles,
  SheetOf,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { v4 as uuid } from 'uuid';
import { LogEventId } from '@votingworks/logging';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { withApp } from '../test/helpers/setup_app';

const jurisdiction = TEST_JURISDICTION;

const frontImagePath =
  electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedFront.asFilePath();
const backImagePath =
  electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedBack.asFilePath();
const sheet: SheetOf<PageInterpretationWithFiles> = (() => {
  const metadata: BallotMetadata = {
    electionHash:
      electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition
        .electionHash,
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

test('getElectionDefinition', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  await withApp(async ({ apiClient, importer }) => {
    expect(await apiClient.getElectionDefinition()).toEqual(null);

    importer.configure(electionDefinition, jurisdiction);

    expect(await apiClient.getElectionDefinition()).toEqual(electionDefinition);

    importer.unconfigure();
    expect(await apiClient.getElectionDefinition()).toEqual(null);
  });
});

test('unconfigure', async () => {
  const { electionDefinition } =
    electionGridLayoutNewHampshireTestBallotFixtures;

  await withApp(async ({ apiClient, importer, store, logger }) => {
    importer.configure(electionDefinition, jurisdiction);
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
  const { electionDefinition } =
    electionGridLayoutNewHampshireTestBallotFixtures;

  await withApp(async ({ apiClient, importer, store }) => {
    importer.configure(electionDefinition, jurisdiction);
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
  const { electionDefinition } =
    electionGridLayoutNewHampshireTestBallotFixtures;

  await withApp(async ({ apiClient, importer, store, logger }) => {
    importer.configure(electionDefinition, jurisdiction);
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
      5,
      LogEventId.ClearingBallotData,
      'unknown',
      {
        message: 'Removing all ballot data, clearing 1 ballots...',
        currentNumberOfBallots: 1,
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
  const { electionDefinition } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  await withApp(async ({ apiClient, importer, store }) => {
    importer.configure(electionDefinition, jurisdiction);

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

    usbDrive.eject.expectCallWith('unknown').resolves();
    await apiClient.ejectUsbDrive();
  });
});
