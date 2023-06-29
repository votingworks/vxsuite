import {
  electionGridLayoutNewHampshireAmherstFixtures,
  electionMinimalExhaustiveSampleFixtures,
} from '@votingworks/fixtures';
import {
  BallotMetadata,
  BallotType,
  MarkThresholds,
  PageInterpretationWithFiles,
  SheetOf,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { v4 as uuid } from 'uuid';
import { LogEventId } from '@votingworks/logging';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { withApp } from '../test/helpers/setup_app';
import { DefaultMarkThresholds } from './store';

const jurisdiction = TEST_JURISDICTION;

const frontImagePath =
  electionGridLayoutNewHampshireAmherstFixtures.scanMarkedFront.asFilePath();
const backImagePath =
  electionGridLayoutNewHampshireAmherstFixtures.scanMarkedBack.asFilePath();
const sheet: SheetOf<PageInterpretationWithFiles> = (() => {
  const metadata: BallotMetadata = {
    electionHash:
      electionGridLayoutNewHampshireAmherstFixtures.electionDefinition
        .electionHash,
    ballotType: BallotType.Standard,
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
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  await withApp(async ({ apiClient, importer }) => {
    expect(await apiClient.getElectionDefinition()).toEqual(null);

    importer.configure(electionDefinition, jurisdiction);

    // This mess of a comparison is due to `Store#getElectionDefinition` adding
    // default `markThresholds` if they're not set, so it may not be the same as
    // we originally set.
    expect(await apiClient.getElectionDefinition()).toEqual({
      ...electionDefinition,
      election: {
        ...electionDefinition.election,
        markThresholds: DefaultMarkThresholds,
      },
    });

    importer.unconfigure();
    expect(await apiClient.getElectionDefinition()).toEqual(null);
  });
});

test('get / set mark threshold overrides', async () => {
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;

  await withApp(async ({ apiClient, importer }) => {
    importer.configure(electionDefinition, jurisdiction);

    expect(await apiClient.getMarkThresholdOverrides()).toEqual(null);

    const mockOverrides: MarkThresholds = {
      definite: 0.5,
      marginal: 0.4,
    };
    await apiClient.setMarkThresholdOverrides({
      markThresholdOverrides: mockOverrides,
    });
    expect(await apiClient.getMarkThresholdOverrides()).toEqual(mockOverrides);

    await apiClient.setMarkThresholdOverrides({});
    expect(await apiClient.getMarkThresholdOverrides()).toEqual(null);
  });
});

test('unconfigure', async () => {
  const { electionDefinition } = electionGridLayoutNewHampshireAmherstFixtures;

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
  const { electionDefinition } = electionGridLayoutNewHampshireAmherstFixtures;

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
  const { electionDefinition } = electionGridLayoutNewHampshireAmherstFixtures;

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
  const { electionDefinition } = electionGridLayoutNewHampshireAmherstFixtures;
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
