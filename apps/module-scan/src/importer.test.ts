import { encodeHMPBBallotPageMetadata } from '@votingworks/ballot-encoder'
import {
  asElectionDefinition,
  electionSample as election,
} from '@votingworks/fixtures'
import { BallotPageMetadata } from '@votingworks/hmpb-interpreter'
import { BallotType } from '@votingworks/types'
import { sleep } from '@votingworks/utils'
import * as fs from 'fs-extra'
import { join } from 'path'
import { dirSync } from 'tmp'
import { v4 as uuid } from 'uuid'
import { makeImageFile, mockWorkerPoolProvider } from '../test/util/mocks'
import Importer from './importer'
import { BatchControl, Scanner } from './scanners'
import { BallotSheetInfo } from './util/ballotAdjudicationReasons'
import { createWorkspace, Workspace } from './util/workspace'
import * as workers from './workers/combined'

const sampleBallotImagesPath = join(__dirname, '..', 'sample-ballot-images/')

let workspace: Workspace

beforeEach(async () => {
  workspace = await createWorkspace(dirSync().name)
})

afterEach(async () => {
  await fs.remove(workspace.path)
  jest.restoreAllMocks()
})

jest.setTimeout(20000)

test('startImport calls scanner.scanSheet', async () => {
  const scanner: jest.Mocked<Scanner> = {
    getStatus: jest.fn(),
    scanSheets: jest.fn(),
    calibrate: jest.fn(),
  }
  const importer = new Importer({
    workspace,
    scanner,
  })

  await expect(importer.startImport()).rejects.toThrow(
    'no election configuration'
  )

  await importer.configure(asElectionDefinition(election))

  // failed scan
  const batchControl: BatchControl = {
    acceptSheet: jest.fn(),
    reviewSheet: jest.fn(),
    rejectSheet: jest.fn(),
    scanSheet: jest
      .fn()
      .mockRejectedValueOnce(new Error('scanner is a banana')),
    endBatch: jest.fn(),
  }
  scanner.scanSheets.mockReturnValueOnce(batchControl)

  await importer.startImport()
  await importer.waitForEndOfBatchOrScanningPause()

  expect(batchControl.endBatch).toHaveBeenCalled()

  const batches = await workspace.store.batchStatus()
  expect(batches[0].error).toEqual('Error: scanner is a banana')

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
  })

  await importer.startImport()
  await importer.waitForEndOfBatchOrScanningPause()
  await importer.unconfigure()
})

test('unconfigure clears all data.', async () => {
  const scanner: jest.Mocked<Scanner> = {
    getStatus: jest.fn(),
    scanSheets: jest.fn(),
    calibrate: jest.fn(),
  }
  const importer = new Importer({
    workspace,
    scanner,
  })

  await importer.configure(asElectionDefinition(election))
  expect(await workspace.store.getElectionDefinition()).toBeDefined()
  await importer.unconfigure()
  expect(await workspace.store.getElectionDefinition()).toBeUndefined()
})

test('setTestMode zeroes and sets test mode on the interpreter', async () => {
  const scanner: jest.Mocked<Scanner> = {
    getStatus: jest.fn(),
    scanSheets: jest.fn(),
    calibrate: jest.fn(),
  }
  const importer = new Importer({
    workspace,
    scanner,
  })

  const frontMetadata: BallotPageMetadata = {
    locales: { primary: 'en-US' },
    electionHash: '',
    ballotType: BallotType.Standard,
    ballotStyleId: election.ballotStyles[0].id,
    precinctId: election.precincts[0].id,
    isTestMode: false,
    pageNumber: 1,
  }
  const backMetadata: BallotPageMetadata = {
    ...frontMetadata,
    pageNumber: 2,
  }
  await importer.configure(asElectionDefinition(election))
  const batchId = await workspace.store.addBatch()
  await workspace.store.addSheet(uuid(), batchId, [
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
  ])
  expect((await importer.getStatus()).batches).toHaveLength(1)

  await importer.setTestMode(true)
  expect((await importer.getStatus()).batches).toHaveLength(0)
  await importer.unconfigure()
})

test('restoreConfig reconfigures the interpreter worker', async () => {
  const scanner: jest.Mocked<Scanner> = {
    getStatus: jest.fn(),
    scanSheets: jest.fn(),
    calibrate: jest.fn(),
  }
  const workerCall = jest.fn()
  const workerPoolProvider = mockWorkerPoolProvider<
    workers.Input,
    workers.Output
  >(workerCall)
  const importer = new Importer({
    workspace,
    scanner,
    workerPoolProvider,
  })

  await importer.restoreConfig()
  expect(workerCall).toHaveBeenCalledWith({
    action: 'configure',
    dbPath: workspace.store.dbPath,
  })
  await importer.unconfigure()
})

test('cannot add HMPB templates before configuring an election', async () => {
  const scanner: jest.Mocked<Scanner> = {
    getStatus: jest.fn(),
    scanSheets: jest.fn(),
    calibrate: jest.fn(),
  }
  const importer = new Importer({
    workspace,
    scanner,
  })

  await expect(
    importer.addHmpbTemplates(Buffer.of(), {
      electionHash: '',
      ballotType: BallotType.Standard,
      locales: { primary: 'en-US' },
      ballotStyleId: '77',
      precinctId: '42',
      isTestMode: false,
    })
  ).rejects.toThrowError(
    'cannot add a HMPB template without a configured election'
  )
})

test('manually importing files', async () => {
  const scanner: jest.Mocked<Scanner> = {
    getStatus: jest.fn(),
    scanSheets: jest.fn(),
    calibrate: jest.fn(),
  }
  const workerCall = jest.fn<Promise<workers.Output>, [workers.Input]>()
  const workerPoolProvider = mockWorkerPoolProvider<
    workers.Input,
    workers.Output
  >(workerCall)
  const importer = new Importer({
    workspace,
    scanner,
    workerPoolProvider,
  })

  const frontMetadata: BallotPageMetadata = {
    electionHash: '',
    ballotType: BallotType.Standard,
    locales: { primary: 'en-US' },
    ballotStyleId: election.ballotStyles[0].id,
    precinctId: election.precincts[0].id,
    isTestMode: false,
    pageNumber: 1,
  }
  const backMetadata: BallotPageMetadata = {
    ...frontMetadata,
    pageNumber: 2,
  }
  await workspace.store.setElection(asElectionDefinition(election))

  const frontImagePath = await makeImageFile()
  const backImagePath = await makeImageFile()

  workerCall.mockImplementation(async (input) => {
    switch (input.action) {
      case 'configure':
        break

      case 'detect-qrcode':
        if (input.imagePath === frontImagePath) {
          return {
            blank: false,
            qrcode: {
              data: encodeHMPBBallotPageMetadata(election, frontMetadata),
              position: 'bottom',
            },
          }
        } else if (input.imagePath === backImagePath) {
          return {
            blank: false,
            qrcode: {
              data: encodeHMPBBallotPageMetadata(election, backMetadata),
              position: 'bottom',
            },
          }
        } else {
          throw new Error(`unexpected image path: ${input.imagePath}`)
        }

      case 'interpret':
        if (input.imagePath === frontImagePath) {
          return {
            interpretation: {
              type: 'UninterpretedHmpbPage',
              metadata: frontMetadata,
            },
            originalFilename: '/tmp/front.png',
            normalizedFilename: '/tmp/front-normalized.png',
          }
        } else if (input.imagePath === backImagePath) {
          return {
            interpretation: {
              type: 'UninterpretedHmpbPage',
              metadata: backMetadata,
            },
            originalFilename: '/tmp/back.png',
            normalizedFilename: '/tmp/back-normalized.png',
          }
        } else {
          throw new Error(`unexpected image path: ${input.imagePath}`)
        }

      default:
        throw new Error('unexpected action')
    }
  })

  const sheetId = await importer.importFile(
    await workspace.store.addBatch(),
    frontImagePath,
    backImagePath
  )

  expect(workerCall).toHaveBeenNthCalledWith(1, {
    action: 'configure',
    dbPath: workspace.store.dbPath,
  })

  expect((await workspace.store.getBallotFilenames(sheetId, 'front'))!).toEqual(
    {
      original: '/tmp/front.png',
      normalized: '/tmp/front-normalized.png',
    }
  )
  expect((await workspace.store.getBallotFilenames(sheetId, 'back'))!).toEqual({
    original: '/tmp/back.png',
    normalized: '/tmp/back-normalized.png',
  })
})

test('scanning pauses on adjudication then continues', async () => {
  const scanner: jest.Mocked<Scanner> = {
    getStatus: jest.fn(),
    scanSheets: jest.fn(),
    calibrate: jest.fn(),
  }
  const mockGetNextAdjudicationSheet = async (): Promise<BallotSheetInfo> => {
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
    }
  }

  const importer = new Importer({
    workspace,
    scanner,
  })

  await importer.configure(asElectionDefinition(election))

  jest.spyOn(workspace.store, 'deleteSheet')
  jest.spyOn(workspace.store, 'saveBallotAdjudication')

  jest
    .spyOn(workspace.store, 'addSheet')
    .mockImplementationOnce(async () => {
      return 'sheet-1'
    })
    .mockImplementationOnce(async () => {
      jest
        .spyOn(workspace.store, 'adjudicationStatus')
        .mockImplementation(async () => {
          return { adjudicated: 0, remaining: 1 }
        })
      return 'sheet-2'
    })
    .mockImplementationOnce(async () => {
      jest
        .spyOn(workspace.store, 'adjudicationStatus')
        .mockImplementation(async () => {
          return { adjudicated: 0, remaining: 1 }
        })
      return 'sheet-3'
    })

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
  })

  await importer.startImport()
  await importer.waitForEndOfBatchOrScanningPause()

  expect(workspace.store.addSheet).toHaveBeenCalledTimes(2)

  // wait a bit and make sure no other call is made
  await sleep(1)
  expect(workspace.store.addSheet).toHaveBeenCalledTimes(2)

  expect(workspace.store.deleteSheet).toHaveBeenCalledTimes(0)

  jest
    .spyOn(workspace.store, 'getNextAdjudicationSheet')
    .mockImplementationOnce(mockGetNextAdjudicationSheet)

  jest
    .spyOn(workspace.store, 'adjudicationStatus')
    .mockImplementation(async () => {
      return { adjudicated: 0, remaining: 0 }
    })

  await importer.continueImport()
  await importer.waitForEndOfBatchOrScanningPause()

  expect(workspace.store.addSheet).toHaveBeenCalledTimes(3)
  expect(workspace.store.deleteSheet).toHaveBeenCalledTimes(1)

  jest
    .spyOn(workspace.store, 'getNextAdjudicationSheet')
    .mockImplementationOnce(mockGetNextAdjudicationSheet)

  jest
    .spyOn(workspace.store, 'adjudicationStatus')
    .mockImplementation(async () => {
      return { adjudicated: 0, remaining: 0 }
    })

  await importer.continueImport(true) // override
  await importer.waitForEndOfBatchOrScanningPause()

  expect(workspace.store.addSheet).toHaveBeenCalledTimes(3) // no more of these
  expect(workspace.store.deleteSheet).toHaveBeenCalledTimes(1) // no more deletes
  expect(workspace.store.saveBallotAdjudication).toHaveBeenCalledTimes(2)
})

test('importing a sheet normalizes and orders HMPB pages', async () => {
  const scanner: jest.Mocked<Scanner> = {
    getStatus: jest.fn(),
    scanSheets: jest.fn(),
    calibrate: jest.fn(),
  }
  const workerCall = jest.fn<Promise<workers.Output>, [workers.Input]>()
  const workerPoolProvider = mockWorkerPoolProvider<
    workers.Input,
    workers.Output
  >(workerCall)

  const importer = new Importer({
    workspace,
    scanner,
    workerPoolProvider,
  })

  await importer.configure(asElectionDefinition(election))
  jest.spyOn(workspace.store, 'addSheet').mockResolvedValueOnce('sheet-id')

  workerCall.mockImplementationOnce(async (input) => {
    expect(input.action).toEqual('configure')
  })

  const frontMetadata: BallotPageMetadata = {
    ballotStyleId: election.ballotStyles[0].id,
    precinctId: election.precincts[0].id,
    ballotType: BallotType.Standard,
    electionHash: '',
    isTestMode: false,
    locales: { primary: 'en-US' },
    pageNumber: 1,
  }
  const backMetadata: BallotPageMetadata = {
    ...frontMetadata,
    pageNumber: 2,
  }

  const frontImagePath = await makeImageFile()
  const backImagePath = await makeImageFile()

  workerCall.mockImplementation(async (input) => {
    switch (input.action) {
      case 'configure':
        break

      case 'detect-qrcode':
        if (
          input.imagePath !== frontImagePath &&
          input.imagePath !== backImagePath
        ) {
          throw new Error(`unexpected image path: ${input.imagePath}`)
        }

        return {
          blank: false,
          qrcode:
            input.imagePath === frontImagePath
              ? {
                  data: encodeHMPBBallotPageMetadata(election, frontMetadata),
                  position: 'bottom',
                }
              : // assume back fails to find QR code, then infers it
                undefined,
        }

      case 'interpret':
        if (
          input.imagePath !== frontImagePath &&
          input.imagePath !== backImagePath
        ) {
          throw new Error(`unexpected image path: ${input.imagePath}`)
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
              allReasonInfos: [],
              enabledReasons: [],
            },
            votes: {},
          },
          originalFilename: '/tmp/original.png',
          normalizedFilename: '/tmp/normalized.png',
        }

      default:
        throw new Error('unexpected action')
    }
  })

  await importer.importFile('batch-id', backImagePath, frontImagePath)

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
  )
})

test('rejects pages that do not match the current precinct', async () => {
  const scanner: jest.Mocked<Scanner> = {
    getStatus: jest.fn(),
    scanSheets: jest.fn(),
    calibrate: jest.fn(),
  }
  const workerCall = jest.fn<Promise<workers.Output>, [workers.Input]>()
  const workerPoolProvider = mockWorkerPoolProvider<
    workers.Input,
    workers.Output
  >(workerCall)

  const importer = new Importer({
    workspace,
    scanner,
    workerPoolProvider,
  })

  await importer.configure(asElectionDefinition(election))
  await workspace.store.setCurrentPrecinctId(election.precincts[1].id)
  jest.spyOn(workspace.store, 'addSheet').mockResolvedValueOnce('sheet-id')

  workerCall.mockImplementationOnce(async (input) => {
    expect(input.action).toEqual('configure')
  })

  const frontMetadata: BallotPageMetadata = {
    ballotStyleId: election.ballotStyles[0].id,
    precinctId: election.precincts[0].id,
    ballotType: BallotType.Standard,
    electionHash: '',
    isTestMode: false,
    locales: { primary: 'en-US' },
    pageNumber: 1,
  }
  const backMetadata: BallotPageMetadata = {
    ...frontMetadata,
    pageNumber: 2,
  }

  const frontImagePath = await makeImageFile()
  const backImagePath = await makeImageFile()

  workerCall.mockImplementation(async (input) => {
    switch (input.action) {
      case 'configure':
        break

      case 'detect-qrcode':
        if (
          input.imagePath !== frontImagePath &&
          input.imagePath !== backImagePath
        ) {
          throw new Error(`unexpected image path: ${input.imagePath}`)
        }

        return {
          blank: false,
          qrcode:
            input.imagePath === frontImagePath
              ? {
                  data: encodeHMPBBallotPageMetadata(election, frontMetadata),
                  position: 'bottom',
                }
              : // assume back fails to find QR code, then infers it
                undefined,
        }

      case 'interpret':
        if (
          input.imagePath !== frontImagePath &&
          input.imagePath !== backImagePath
        ) {
          throw new Error(`unexpected image path: ${input.imagePath}`)
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
              allReasonInfos: [],
              enabledReasons: [],
            },
            votes: {},
          },
          originalFilename: '/tmp/original.png',
          normalizedFilename: '/tmp/normalized.png',
        }

      default:
        throw new Error('unexpected action')
    }
  })

  await importer.importFile('batch-id', backImagePath, frontImagePath)

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
  )
})

test('doCalibrate', async () => {
  const scanner: jest.Mocked<Scanner> = {
    getStatus: jest.fn(),
    scanSheets: jest.fn(),
    calibrate: jest.fn(),
  }
  const importer = new Importer({
    workspace,
    scanner,
  })

  scanner.calibrate.mockResolvedValueOnce(true)
  expect(await importer.doCalibrate()).toEqual(true)
  scanner.calibrate.mockResolvedValueOnce(false)
  expect(await importer.doCalibrate()).toEqual(false)
})
