import { encodeHmpbBallotPageMetadata } from '@votingworks/ballot-encoder';
import {
  electionSample as election,
  electionSampleDefinition as electionDefinition,
} from '@votingworks/fixtures';
import {
  BallotPageMetadata,
  BallotSheetInfo,
  BallotType,
} from '@votingworks/types';
import { assert, sleep } from '@votingworks/utils';
import { Buffer } from 'buffer';
import * as fs from 'fs-extra';
import { join } from 'path';
import { dirSync } from 'tmp';
import { v4 as uuid } from 'uuid';
import { makeImageFile, mockWorkerPoolProvider } from '../test/util/mocks';
import { Importer } from './importer';
import { BatchControl, BatchScanner } from './fujitsu_scanner';
import { createWorkspace, Workspace } from './util/workspace';
import * as workers from './workers/combined';

const sampleBallotImagesPath = join(__dirname, '..', 'sample-ballot-images/');

let workspace: Workspace;

beforeEach(() => {
  workspace = createWorkspace(dirSync().name);
});

afterEach(async () => {
  await fs.remove(workspace.path);
  jest.restoreAllMocks();
});

jest.setTimeout(20000);

test('startImport calls scanner.scanSheet', async () => {
  const scanner: jest.Mocked<BatchScanner> = {
    scanSheets: jest.fn(),
  };
  const importer = new Importer({
    workspace,
    scanner,
  });

  await expect(importer.startImport()).rejects.toThrow(
    'no election configuration'
  );

  importer.configure(electionDefinition);

  // failed scan
  const batchControl: BatchControl = {
    acceptSheet: jest.fn(),
    reviewSheet: jest.fn(),
    rejectSheet: jest.fn(),
    scanSheet: jest
      .fn()
      .mockRejectedValueOnce(new Error('scanner is a banana')),
    endBatch: jest.fn(),
  };
  scanner.scanSheets.mockReturnValueOnce(batchControl);

  await importer.startImport();
  await importer.waitForEndOfBatchOrScanningPause();

  expect(batchControl.endBatch).toHaveBeenCalled();

  const batches = workspace.store.batchStatus();
  expect(batches[0].error).toEqual('Error: scanner is a banana');

  // successful scan
  scanner.scanSheets.mockReturnValueOnce({
    acceptSheet: jest.fn(),
    reviewSheet: jest.fn(),
    rejectSheet: jest.fn(),
    scanSheet: jest
      .fn()
      .mockResolvedValueOnce([
        join(sampleBallotImagesPath, 'sample-batch-1-ballot-1.png'),
        join(sampleBallotImagesPath, 'blank-page.png'),
      ]),
    endBatch: jest.fn(),
  });

  await importer.startImport();
  await importer.waitForEndOfBatchOrScanningPause();
  await importer.unconfigure();
});

test('unconfigure clears all data.', async () => {
  const scanner: jest.Mocked<BatchScanner> = {
    scanSheets: jest.fn(),
  };
  const importer = new Importer({
    workspace,
    scanner,
  });

  importer.configure(electionDefinition);
  expect(workspace.store.getElectionDefinition()).toBeDefined();
  await importer.unconfigure();
  expect(workspace.store.getElectionDefinition()).toBeUndefined();
});

test('setTestMode zeroes and sets test mode on the interpreter', async () => {
  const scanner: jest.Mocked<BatchScanner> = {
    scanSheets: jest.fn(),
  };
  const importer = new Importer({
    workspace,
    scanner,
  });

  const frontMetadata: BallotPageMetadata = {
    locales: { primary: 'en-US' },
    electionHash: electionDefinition.electionHash,
    ballotType: BallotType.Standard,
    ballotStyleId: election.ballotStyles[0].id,
    precinctId: election.precincts[0].id,
    isTestMode: false,
    pageNumber: 1,
  };
  const backMetadata: BallotPageMetadata = {
    ...frontMetadata,
    pageNumber: 2,
  };
  importer.configure(electionDefinition);
  const batchId = workspace.store.addBatch();
  workspace.store.addSheet(uuid(), batchId, [
    {
      originalFilename: '/tmp/front-page.png',
      normalizedFilename: '/tmp/front-normalized-page.png',
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: frontMetadata,
      },
    },
    {
      originalFilename: '/tmp/back-page.png',
      normalizedFilename: '/tmp/back-normalized-page.png',
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: backMetadata,
      },
    },
  ]);
  expect(importer.getStatus().batches).toHaveLength(1);

  await importer.setTestMode(true);
  expect(importer.getStatus().batches).toHaveLength(0);
  await importer.unconfigure();
});

test('restoreConfig reconfigures the interpreter worker', async () => {
  const scanner: jest.Mocked<BatchScanner> = {
    scanSheets: jest.fn(),
  };
  const workerCall = jest.fn();
  const workerPoolProvider = mockWorkerPoolProvider<
    workers.Input,
    workers.Output
  >(workerCall);
  const importer = new Importer({
    workspace,
    scanner,
    workerPoolProvider,
  });

  await importer.restoreConfig();
  expect(workerCall).toHaveBeenCalledWith({
    action: 'configure',
    dbPath: workspace.store.getDbPath(),
  });
  await importer.unconfigure();
});

test('cannot add HMPB templates before configuring an election', async () => {
  const scanner: jest.Mocked<BatchScanner> = {
    scanSheets: jest.fn(),
  };
  const importer = new Importer({
    workspace,
    scanner,
  });

  await expect(importer.addHmpbTemplates(Buffer.of(), [])).rejects.toThrowError(
    'cannot add a HMPB template without a configured election'
  );
});

test('manually importing files', async () => {
  const scanner: jest.Mocked<BatchScanner> = {
    scanSheets: jest.fn(),
  };
  const workerCall = jest.fn<Promise<workers.Output>, [workers.Input]>();
  const workerPoolProvider = mockWorkerPoolProvider<
    workers.Input,
    workers.Output
  >(workerCall);
  const importer = new Importer({
    workspace,
    scanner,
    workerPoolProvider,
  });

  const frontMetadata: BallotPageMetadata = {
    electionHash: electionDefinition.electionHash,
    ballotType: BallotType.Standard,
    locales: { primary: 'en-US' },
    ballotStyleId: election.ballotStyles[0].id,
    precinctId: election.precincts[0].id,
    isTestMode: false,
    pageNumber: 1,
  };
  const backMetadata: BallotPageMetadata = {
    ...frontMetadata,
    pageNumber: 2,
  };
  workspace.store.setElection(electionDefinition);

  const frontImagePath = await makeImageFile();
  const backImagePath = await makeImageFile();

  // eslint-disable-next-line @typescript-eslint/require-await
  workerCall.mockImplementation(async (input) => {
    switch (input.action) {
      case 'configure':
        break;

      case 'detect-qrcode':
        if (input.imagePath === frontImagePath) {
          return {
            blank: false,
            qrcode: {
              data: encodeHmpbBallotPageMetadata(election, frontMetadata),
              position: 'bottom',
            },
          };
        }

        if (input.imagePath === backImagePath) {
          return {
            blank: false,
            qrcode: {
              data: encodeHmpbBallotPageMetadata(election, backMetadata),
              position: 'bottom',
            },
          };
        }

        throw new Error(`unexpected image path: ${input.imagePath}`);

      case 'interpret':
        assert(input.interpreter === 'vx');
        if (input.imagePath === frontImagePath) {
          return {
            interpretation: {
              type: 'UninterpretedHmpbPage',
              metadata: frontMetadata,
            },
            originalFilename: '/tmp/front.png',
            normalizedFilename: '/tmp/front-normalized.png',
          };
        }
        if (input.imagePath === backImagePath) {
          return {
            interpretation: {
              type: 'UninterpretedHmpbPage',
              metadata: backMetadata,
            },
            originalFilename: '/tmp/back.png',
            normalizedFilename: '/tmp/back-normalized.png',
          };
        }
        throw new Error(`unexpected image path: ${input.imagePath}`);

      default:
        throw new Error('unexpected action');
    }
  });

  const sheetId = await importer.importSheet(
    workspace.store.addBatch(),
    frontImagePath,
    backImagePath
  );

  expect(workerCall).toHaveBeenNthCalledWith(1, {
    action: 'configure',
    dbPath: workspace.store.getDbPath(),
  });

  expect(workspace.store.getBallotFilenames(sheetId, 'front')!).toEqual({
    original: '/tmp/front.png',
    normalized: '/tmp/front-normalized.png',
  });
  expect(workspace.store.getBallotFilenames(sheetId, 'back')!).toEqual({
    original: '/tmp/back.png',
    normalized: '/tmp/back-normalized.png',
  });
});

test('scanning pauses on adjudication then continues', async () => {
  const scanner: jest.Mocked<BatchScanner> = {
    scanSheets: jest.fn(),
  };
  function mockGetNextAdjudicationSheet(): BallotSheetInfo {
    return {
      id: 'mock-sheet-id',
      front: {
        image: { url: '/url/front' },
        interpretation: { type: 'BlankPage' },
      },
      back: {
        image: { url: '/url/back' },
        interpretation: { type: 'BlankPage' },
      },
    };
  }

  const importer = new Importer({
    workspace,
    scanner,
  });

  importer.configure(electionDefinition);

  jest.spyOn(workspace.store, 'deleteSheet');
  jest.spyOn(workspace.store, 'adjudicateSheet');

  jest
    .spyOn(workspace.store, 'addSheet')
    .mockImplementationOnce(() => {
      return 'sheet-1';
    })
    .mockImplementationOnce(() => {
      jest
        .spyOn(workspace.store, 'adjudicationStatus')
        .mockImplementation(() => {
          return { adjudicated: 0, remaining: 1 };
        });
      return 'sheet-2';
    })
    .mockImplementationOnce(() => {
      jest
        .spyOn(workspace.store, 'adjudicationStatus')
        .mockImplementation(() => {
          return { adjudicated: 0, remaining: 1 };
        });
      return 'sheet-3';
    });

  scanner.scanSheets.mockReturnValueOnce({
    acceptSheet: jest.fn(),
    reviewSheet: jest.fn(),
    rejectSheet: jest.fn(),
    scanSheet: jest
      .fn()
      .mockResolvedValueOnce([
        join(sampleBallotImagesPath, 'sample-batch-1-ballot-1.png'),
        join(sampleBallotImagesPath, 'blank-page.png'),
      ])
      .mockResolvedValueOnce([
        join(sampleBallotImagesPath, 'sample-batch-1-ballot-2.png'),
        join(sampleBallotImagesPath, 'blank-page.png'),
      ])
      .mockResolvedValueOnce([
        join(sampleBallotImagesPath, 'sample-batch-1-ballot-3.png'),
        join(sampleBallotImagesPath, 'blank-page.png'),
      ]),
    endBatch: jest.fn(),
  });

  await importer.startImport();
  await importer.waitForEndOfBatchOrScanningPause();

  expect(workspace.store.addSheet).toHaveBeenCalledTimes(2);

  // wait a bit and make sure no other call is made
  await sleep(1);
  expect(workspace.store.addSheet).toHaveBeenCalledTimes(2);

  expect(workspace.store.deleteSheet).toHaveBeenCalledTimes(0);

  jest
    .spyOn(workspace.store, 'getNextAdjudicationSheet')
    .mockImplementationOnce(mockGetNextAdjudicationSheet);

  jest
    .spyOn(workspace.store, 'adjudicationStatus')
    .mockReturnValue({ adjudicated: 0, remaining: 0 });

  await importer.continueImport({ forceAccept: false });
  await importer.waitForEndOfBatchOrScanningPause();

  expect(workspace.store.addSheet).toHaveBeenCalledTimes(3);
  expect(workspace.store.deleteSheet).toHaveBeenCalledTimes(1);

  jest
    .spyOn(workspace.store, 'getNextAdjudicationSheet')
    .mockImplementationOnce(mockGetNextAdjudicationSheet);

  jest
    .spyOn(workspace.store, 'adjudicationStatus')
    .mockReturnValue({ adjudicated: 0, remaining: 0 });

  await importer.continueImport({
    forceAccept: true,
    frontMarkAdjudications: [],
    backMarkAdjudications: [],
  });
  await importer.waitForEndOfBatchOrScanningPause();

  expect(workspace.store.addSheet).toHaveBeenCalledTimes(3); // no more of these
  expect(workspace.store.deleteSheet).toHaveBeenCalledTimes(1); // no more deletes
  expect(workspace.store.adjudicateSheet).toHaveBeenCalledTimes(2);
});

test('importing a sheet normalizes and orders HMPB pages', async () => {
  const scanner: jest.Mocked<BatchScanner> = {
    scanSheets: jest.fn(),
  };
  const workerCall = jest.fn<Promise<workers.Output>, [workers.Input]>();
  const workerPoolProvider = mockWorkerPoolProvider<
    workers.Input,
    workers.Output
  >(workerCall);

  const importer = new Importer({
    workspace,
    scanner,
    workerPoolProvider,
  });

  importer.configure(electionDefinition);
  jest.spyOn(workspace.store, 'addSheet').mockReturnValueOnce('sheet-id');

  // eslint-disable-next-line @typescript-eslint/require-await
  workerCall.mockImplementationOnce(async (input) => {
    expect(input.action).toEqual('configure');
  });

  const frontMetadata: BallotPageMetadata = {
    ballotStyleId: election.ballotStyles[0].id,
    precinctId: election.precincts[0].id,
    ballotType: BallotType.Standard,
    electionHash: electionDefinition.electionHash,
    isTestMode: false,
    locales: { primary: 'en-US' },
    pageNumber: 1,
  };
  const backMetadata: BallotPageMetadata = {
    ...frontMetadata,
    pageNumber: 2,
  };

  const frontImagePath = await makeImageFile();
  const backImagePath = await makeImageFile();

  // eslint-disable-next-line @typescript-eslint/require-await
  workerCall.mockImplementation(async (input) => {
    switch (input.action) {
      case 'configure':
        break;

      case 'detect-qrcode':
        if (
          input.imagePath !== frontImagePath &&
          input.imagePath !== backImagePath
        ) {
          throw new Error(`unexpected image path: ${input.imagePath}`);
        }

        return {
          blank: false,
          qrcode:
            input.imagePath === frontImagePath
              ? {
                  data: encodeHmpbBallotPageMetadata(election, frontMetadata),
                  position: 'bottom',
                }
              : // assume back fails to find QR code, then infers it
                undefined,
        };

      case 'interpret':
        assert(input.interpreter === 'vx');
        if (
          input.imagePath !== frontImagePath &&
          input.imagePath !== backImagePath
        ) {
          throw new Error(`unexpected image path: ${input.imagePath}`);
        }

        return {
          interpretation: {
            type: 'InterpretedHmpbPage',
            metadata:
              input.imagePath === frontImagePath ? frontMetadata : backMetadata,
            markInfo: {
              marks: [],
              ballotSize: { width: 1, height: 1 },
            },
            adjudicationInfo: {
              requiresAdjudication: false,
              ignoredReasonInfos: [],
              enabledReasonInfos: [],
              enabledReasons: [],
            },
            votes: {},
          },
          originalFilename: '/tmp/original.png',
          normalizedFilename: '/tmp/normalized.png',
        };

      default:
        throw new Error('unexpected action');
    }
  });

  await importer.importSheet('batch-id', backImagePath, frontImagePath);

  expect(workspace.store.addSheet).toHaveBeenCalledWith(
    expect.any(String),
    'batch-id',
    [
      expect.objectContaining({
        interpretation: expect.objectContaining({
          metadata: expect.objectContaining({
            pageNumber: 1,
          }),
        }),
      }),
      expect.objectContaining({
        interpretation: expect.objectContaining({
          metadata: expect.objectContaining({
            pageNumber: 2,
          }),
        }),
      }),
    ]
  );
});

test('rejects pages that do not match the current precinct', async () => {
  const scanner: jest.Mocked<BatchScanner> = {
    scanSheets: jest.fn(),
  };
  const workerCall = jest.fn<Promise<workers.Output>, [workers.Input]>();
  const workerPoolProvider = mockWorkerPoolProvider<
    workers.Input,
    workers.Output
  >(workerCall);

  const importer = new Importer({
    workspace,
    scanner,
    workerPoolProvider,
  });

  importer.configure(electionDefinition);
  workspace.store.setCurrentPrecinctId(election.precincts[1].id);
  jest.spyOn(workspace.store, 'addSheet').mockReturnValueOnce('sheet-id');

  // eslint-disable-next-line @typescript-eslint/require-await
  workerCall.mockImplementationOnce(async (input) => {
    expect(input.action).toEqual('configure');
  });

  const frontMetadata: BallotPageMetadata = {
    ballotStyleId: election.ballotStyles[0].id,
    precinctId: election.precincts[0].id,
    ballotType: BallotType.Standard,
    electionHash: electionDefinition.electionHash,
    isTestMode: false,
    locales: { primary: 'en-US' },
    pageNumber: 1,
  };
  const backMetadata: BallotPageMetadata = {
    ...frontMetadata,
    pageNumber: 2,
  };

  const frontImagePath = await makeImageFile();
  const backImagePath = await makeImageFile();

  // eslint-disable-next-line @typescript-eslint/require-await
  workerCall.mockImplementation(async (input) => {
    switch (input.action) {
      case 'configure':
        break;

      case 'detect-qrcode':
        if (
          input.imagePath !== frontImagePath &&
          input.imagePath !== backImagePath
        ) {
          throw new Error(`unexpected image path: ${input.imagePath}`);
        }

        return {
          blank: false,
          qrcode:
            input.imagePath === frontImagePath
              ? {
                  data: encodeHmpbBallotPageMetadata(election, frontMetadata),
                  position: 'bottom',
                }
              : // assume back fails to find QR code, then infers it
                undefined,
        };

      case 'interpret':
        assert(input.interpreter === 'vx');
        if (
          input.imagePath !== frontImagePath &&
          input.imagePath !== backImagePath
        ) {
          throw new Error(`unexpected image path: ${input.imagePath}`);
        }

        return {
          interpretation: {
            type: 'InterpretedHmpbPage',
            metadata:
              input.imagePath === frontImagePath ? frontMetadata : backMetadata,
            markInfo: {
              marks: [],
              ballotSize: { width: 1, height: 1 },
            },
            adjudicationInfo: {
              requiresAdjudication: false,
              ignoredReasonInfos: [],
              enabledReasonInfos: [],
              enabledReasons: [],
            },
            votes: {},
          },
          originalFilename: '/tmp/original.png',
          normalizedFilename: '/tmp/normalized.png',
        };

      default:
        throw new Error('unexpected action');
    }
  });

  await importer.importSheet('batch-id', backImagePath, frontImagePath);

  expect(workspace.store.addSheet).toHaveBeenCalledWith(
    expect.any(String),
    'batch-id',
    [
      expect.objectContaining({
        interpretation: expect.objectContaining({
          type: 'InvalidPrecinctPage',
          metadata: expect.objectContaining({
            pageNumber: 1,
          }),
        }),
      }),
      expect.objectContaining({
        interpretation: expect.objectContaining({
          type: 'InvalidPrecinctPage',
          metadata: expect.objectContaining({
            pageNumber: 2,
          }),
        }),
      }),
    ]
  );
});

test('rejects sheets that would not produce a valid CVR', async () => {
  const scanner: jest.Mocked<BatchScanner> = {
    scanSheets: jest.fn(),
  };
  const workerCall = jest.fn<Promise<workers.Output>, [workers.Input]>();
  const workerPoolProvider = mockWorkerPoolProvider<
    workers.Input,
    workers.Output
  >(workerCall);

  const importer = new Importer({
    workspace,
    scanner,
    workerPoolProvider,
  });

  const currentPrecinctId = election.precincts[0].id;
  importer.configure(electionDefinition);
  workspace.store.setCurrentPrecinctId(currentPrecinctId);
  jest.spyOn(workspace.store, 'addSheet').mockReturnValueOnce('sheet-id');

  // eslint-disable-next-line @typescript-eslint/require-await
  workerCall.mockImplementationOnce(async (input) => {
    expect(input.action).toEqual('configure');
  });

  const frontMetadata: BallotPageMetadata = {
    ballotStyleId: election.ballotStyles[0].id,
    precinctId: currentPrecinctId,
    ballotType: BallotType.Standard,
    electionHash: electionDefinition.electionHash,
    isTestMode: false,
    locales: { primary: 'en-US' },
    pageNumber: 1,
  };
  const backMetadata: BallotPageMetadata = {
    ...frontMetadata,
    ballotStyleId: election.ballotStyles[1].id,
    pageNumber: 2,
  };

  const frontImagePath = await makeImageFile();
  const backImagePath = await makeImageFile();

  // eslint-disable-next-line @typescript-eslint/require-await
  workerCall.mockImplementation(async (input) => {
    switch (input.action) {
      case 'configure':
        break;

      case 'detect-qrcode':
        if (
          input.imagePath !== frontImagePath &&
          input.imagePath !== backImagePath
        ) {
          throw new Error(`unexpected image path: ${input.imagePath}`);
        }

        return {
          blank: false,
          qrcode:
            input.imagePath === frontImagePath
              ? {
                  data: encodeHmpbBallotPageMetadata(election, frontMetadata),
                  position: 'bottom',
                }
              : // assume back fails to find QR code, then infers it
                undefined,
        };

      case 'interpret':
        assert(input.interpreter === 'vx');
        if (
          input.imagePath !== frontImagePath &&
          input.imagePath !== backImagePath
        ) {
          throw new Error(`unexpected image path: ${input.imagePath}`);
        }

        return {
          interpretation: {
            type: 'InterpretedHmpbPage',
            metadata:
              input.imagePath === frontImagePath ? frontMetadata : backMetadata,
            markInfo: {
              marks: [],
              ballotSize: { width: 1, height: 1 },
            },
            adjudicationInfo: {
              requiresAdjudication: false,
              ignoredReasonInfos: [],
              enabledReasonInfos: [],
              enabledReasons: [],
            },
            votes: {},
          },
          originalFilename: '/tmp/original.png',
          normalizedFilename: '/tmp/normalized.png',
        };

      default:
        throw new Error('unexpected action');
    }
  });

  await importer.importSheet('batch-id', backImagePath, frontImagePath);

  expect(workspace.store.addSheet).toHaveBeenCalledWith(
    expect.any(String),
    'batch-id',
    [
      expect.objectContaining({
        interpretation: expect.objectContaining({ type: 'UnreadablePage' }),
      }),
      expect.objectContaining({
        interpretation: expect.objectContaining({ type: 'UnreadablePage' }),
      }),
    ]
  );
});
