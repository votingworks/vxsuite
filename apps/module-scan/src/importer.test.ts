import {
  BallotType,
  electionDefinitionSample as electionDefinition,
  v1,
} from '@votingworks/ballot-encoder'
import { BallotPageMetadata } from '@votingworks/hmpb-interpreter'
import * as fs from 'fs-extra'
import { join } from 'path'
import { dirSync } from 'tmp'
import { v4 as uuid } from 'uuid'
import { makeImageFile, mockWorkerPoolProvider } from '../test/util/mocks'
import SystemImporter, { sleep } from './importer'
import { Scanner } from './scanner'
import { BallotMetadata, SheetOf } from './types'
import { BallotSheetInfo } from './util/ballotAdjudicationReasons'
import { fromElection } from './util/electionDefinition'
import { createWorkspace, Workspace } from './util/workspace'
import * as interpretWorker from './workers/interpret'
import * as qrcodeWorker from './workers/qrcode'

const { election, electionHash } = electionDefinition
const sampleBallotImagesPath = join(__dirname, '..', 'sample-ballot-images/')

let workspace: Workspace

beforeEach(async () => {
  workspace = await createWorkspace(dirSync().name)
})

afterEach(async () => {
  await fs.remove(workspace.path)
  jest.restoreAllMocks()
})

jest.setTimeout(10000)

test('startImport calls scanner.scanSheet', async () => {
  const scanner: jest.Mocked<Scanner> = {
    scanSheets: jest.fn(),
  }
  const importer = new SystemImporter({
    workspace,
    scanner,
  })

  await expect(importer.startImport()).rejects.toThrow(
    'no election configuration'
  )

  await importer.configure(fromElection(election))

  // failed scan
  const generator: AsyncGenerator<SheetOf<string>> = {
    async next(): Promise<IteratorResult<SheetOf<string>>> {
      throw new Error('scanner is a banana')
    },

    return(): Promise<IteratorResult<SheetOf<string>>> {
      throw new Error('scanner is a banana')
    },

    throw: jest.fn(),

    [Symbol.asyncIterator](): AsyncGenerator<SheetOf<string>> {
      return generator
    },
  }

  scanner.scanSheets.mockImplementationOnce(() => generator)

  await importer.startImport()
  await importer.waitForEndOfBatchOrScanningPause()

  expect(generator.throw).toHaveBeenCalled()

  const batches = await workspace.store.batchStatus()
  expect(batches[0].error).toEqual('Error: scanner is a banana')

  // successful scan
  scanner.scanSheets.mockImplementationOnce(async function* (): AsyncGenerator<
    SheetOf<string>
  > {
    yield [
      join(sampleBallotImagesPath, 'sample-batch-1-ballot-1.png'),
      join(sampleBallotImagesPath, 'blank-page.png'),
    ]
  })
  await importer.startImport()
  await importer.waitForEndOfBatchOrScanningPause()
  await importer.unconfigure()
})

test('unconfigure clears all data.', async () => {
  const scanner: jest.Mocked<Scanner> = {
    scanSheets: jest.fn(),
  }
  const importer = new SystemImporter({
    workspace,
    scanner,
  })

  await importer.configure(fromElection(election))
  expect(await workspace.store.getElectionDefinition()).toBeDefined()
  await importer.unconfigure()
  expect(await workspace.store.getElectionDefinition()).toBeUndefined()
})

test('setTestMode zeroes and sets test mode on the interpreter', async () => {
  const scanner: jest.Mocked<Scanner> = {
    scanSheets: jest.fn(),
  }
  const importer = new SystemImporter({
    workspace,
    scanner,
  })

  await importer.configure(fromElection(election))
  const batchId = await workspace.store.addBatch()
  await workspace.store.addSheet(uuid(), batchId, [
    {
      originalFilename: '/tmp/front-page.png',
      normalizedFilename: '/tmp/front-normalized-page.png',
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: {
          locales: { primary: 'en-US' },
          electionHash,
          ballotType: BallotType.Standard,
          ballotStyleId: '12',
          precinctId: '23',
          isTestMode: false,
          pageNumber: 1,
        },
      },
    },
    {
      originalFilename: '/tmp/back-page.png',
      normalizedFilename: '/tmp/back-normalized-page.png',
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: {
          locales: { primary: 'en-US' },
          electionHash,
          ballotType: BallotType.Standard,
          ballotStyleId: '12',
          precinctId: '23',
          isTestMode: false,
          pageNumber: 2,
        },
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
    scanSheets: jest.fn(),
  }
  const interpretWorkerCall = jest.fn()
  const interpreterWorkerPoolProvider = mockWorkerPoolProvider<
    interpretWorker.Input,
    interpretWorker.Output
  >(interpretWorkerCall)
  const importer = new SystemImporter({
    workspace,
    scanner,
    interpretWorkerPoolProvider: interpreterWorkerPoolProvider,
  })

  await importer.restoreConfig()
  expect(interpretWorkerCall).toHaveBeenCalledWith({
    action: 'configure',
    dbPath: workspace.store.dbPath,
  })
  await importer.unconfigure()
})

test('cannot add HMPB templates before configuring an election', async () => {
  const scanner: jest.Mocked<Scanner> = {
    scanSheets: jest.fn(),
  }
  const importer = new SystemImporter({
    workspace,
    scanner,
  })

  await expect(
    importer.addHmpbTemplates(Buffer.of(), {
      electionHash,
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
    scanSheets: jest.fn(),
  }
  const qrcodeWorkerCall = jest.fn<
    Promise<qrcodeWorker.Output>,
    [qrcodeWorker.Input]
  >()
  const qrcodeWorkerPoolProvider = mockWorkerPoolProvider<
    qrcodeWorker.Input,
    qrcodeWorker.Output
  >(qrcodeWorkerCall)
  const interpretWorkerCall = jest.fn<
    Promise<interpretWorker.Output>,
    [interpretWorker.Input]
  >()
  const interpretWorkerPoolProvider = mockWorkerPoolProvider<
    interpretWorker.Input,
    interpretWorker.Output
  >(interpretWorkerCall)
  const importer = new SystemImporter({
    workspace,
    scanner,
    interpretWorkerPoolProvider,
    qrcodeWorkerPoolProvider,
  })

  const frontMetadata: BallotPageMetadata = {
    electionHash,
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
  await workspace.store.setElection(fromElection(election))
  qrcodeWorkerCall
    .mockResolvedValueOnce({
      data: v1.encodeHMPBBallotPageMetadata(election, frontMetadata),
      position: 'bottom',
    })
    .mockResolvedValueOnce({
      data: v1.encodeHMPBBallotPageMetadata(election, backMetadata),
      position: 'bottom',
    })
  interpretWorkerCall
    // configure
    .mockImplementationOnce(async (input) => {
      expect(input.action).toEqual('configure')
    })
    // interpret front
    .mockResolvedValueOnce({
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: frontMetadata,
      },
      originalFilename: '/tmp/original.png',
      normalizedFilename: '/tmp/normalized.png',
    })
    // interpret back
    .mockResolvedValueOnce({
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: backMetadata,
      },
      originalFilename: '/tmp/original.png',
      normalizedFilename: '/tmp/normalized.png',
    })
  const imageFile = await makeImageFile()
  const sheetId = await importer.importFile(
    await workspace.store.addBatch(),
    imageFile,
    imageFile
  )

  const filenames = (await workspace.store.getBallotFilenames(
    sheetId,
    'front'
  ))!
  expect(filenames.original).toBe('/tmp/original.png')
  expect(filenames.normalized).toBe('/tmp/normalized.png')
})

test('scanning pauses on adjudication then continues', async () => {
  const scanner: jest.Mocked<Scanner> = {
    scanSheets: jest.fn(),
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

  const importer = new SystemImporter({
    workspace,
    scanner,
  })

  await importer.configure(fromElection(election))

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

  scanner.scanSheets.mockImplementationOnce(async function* (): AsyncGenerator<
    SheetOf<string>
  > {
    yield [
      join(sampleBallotImagesPath, 'sample-batch-1-ballot-1.png'),
      join(sampleBallotImagesPath, 'blank-page.png'),
    ]

    yield [
      join(sampleBallotImagesPath, 'sample-batch-1-ballot-2.png'),
      join(sampleBallotImagesPath, 'blank-page.png'),
    ]

    yield [
      join(sampleBallotImagesPath, 'sample-batch-1-ballot-3.png'),
      join(sampleBallotImagesPath, 'blank-page.png'),
    ]
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

test('importing a sheet orders HMPB pages and infers a single missing QR code', async () => {
  const scanner: jest.Mocked<Scanner> = {
    scanSheets: jest.fn(),
  }
  const interpretWorkerCall = jest.fn<
    Promise<interpretWorker.Output>,
    [interpretWorker.Input]
  >()
  const interpretWorkerPoolProvider = mockWorkerPoolProvider<
    interpretWorker.Input,
    interpretWorker.Output
  >(interpretWorkerCall)
  const qrcodeWorkerCall = jest.fn<
    Promise<qrcodeWorker.Output>,
    [qrcodeWorker.Input]
  >()
  const qrcodeWorkerPoolProvider = mockWorkerPoolProvider<
    qrcodeWorker.Input,
    qrcodeWorker.Output
  >(qrcodeWorkerCall)

  const importer = new SystemImporter({
    workspace,
    scanner,
    interpretWorkerPoolProvider,
    qrcodeWorkerPoolProvider,
  })

  importer.configure(fromElection(election))
  jest.spyOn(workspace.store, 'addSheet').mockResolvedValueOnce('sheet-id')

  interpretWorkerCall.mockImplementationOnce(async (input) => {
    expect(input.action).toEqual('configure')
  })

  const sheetMetadata: BallotMetadata = {
    ballotStyleId: election.ballotStyles[0].id,
    precinctId: election.precincts[0].id,
    ballotType: BallotType.Standard,
    electionHash,
    isTestMode: false,
    locales: { primary: 'en-US' },
  }

  for (const pageNumber of [2, 1]) {
    const metadata: BallotPageMetadata = {
      ...sheetMetadata,
      pageNumber,
    }
    qrcodeWorkerCall.mockResolvedValueOnce(
      pageNumber === 2
        ? {
            data: v1.encodeHMPBBallotPageMetadata(election, metadata),
            position: 'bottom',
          }
        : undefined
    )
    interpretWorkerCall.mockResolvedValueOnce({
      interpretation: {
        type: 'InterpretedHmpbPage',
        metadata,
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
    })
  }

  const imageFile = await makeImageFile()
  await importer.importFile('batch-id', imageFile, imageFile)

  // ensure QR codes were read/inferred
  expect(interpretWorkerCall).toHaveBeenNthCalledWith(2, {
    action: 'interpret',
    imagePath: imageFile,
    qrcode: {
      data: v1.encodeHMPBBallotPageMetadata(election, {
        ...sheetMetadata,
        pageNumber: 2,
      }),
      position: 'bottom',
    },
    sheetId: expect.any(String),
    ballotImagesPath: expect.any(String),
  })
  expect(interpretWorkerCall).toHaveBeenNthCalledWith(3, {
    action: 'interpret',
    imagePath: imageFile,
    qrcode: {
      data: v1.encodeHMPBBallotPageMetadata(election, {
        ...sheetMetadata,
        pageNumber: 1,
      }),
      position: 'bottom',
    },
    sheetId: expect.any(String),
    ballotImagesPath: expect.any(String),
  })

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
