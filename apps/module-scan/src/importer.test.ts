import {
  BallotType,
  electionSample as election,
} from '@votingworks/ballot-encoder'
import * as fs from 'fs-extra'
import { join } from 'path'
import { v4 as uuid } from 'uuid'
import { makeImageFile, makeMockInterpreter } from '../test/util/mocks'
import SystemImporter, { sleep } from './importer'
import { Scanner } from './scanner'
import Store from './store'
import { SheetOf } from './types'
import { BallotSheetInfo } from './util/ballotAdjudicationReasons'
import { fromElection } from './util/electionDefinition'
import makeTemporaryBallotImportImageDirectories, {
  TemporaryBallotImportImageDirectories,
} from './util/makeTemporaryBallotImportImageDirectories'
import pdfToImages from './util/pdfToImages'

const sampleBallotImagesPath = join(__dirname, '..', 'sample-ballot-images/')

jest.mock('./util/pdfToImages')
const pdfToImagesMock = pdfToImages as jest.MockedFunction<typeof pdfToImages>

let importDirs: TemporaryBallotImportImageDirectories

beforeEach(() => {
  importDirs = makeTemporaryBallotImportImageDirectories()
})

afterEach(() => {
  importDirs.remove()
  jest.restoreAllMocks()
})

jest.setTimeout(10000)

test('startImport calls scanner.scanSheet', async () => {
  const scanner: jest.Mocked<Scanner> = {
    scanSheets: jest.fn(),
  }
  const store = await Store.memoryStore()
  const importer = new SystemImporter({
    ...importDirs.paths,
    store,
    scanner,
  })
  await expect(importer.startImport()).rejects.toThrow(
    'no election configuration'
  )

  await importer.configure(fromElection(election))

  // failed scan
  scanner.scanSheets.mockImplementationOnce(async function* (): AsyncGenerator<
    SheetOf<string>
  > {
    yield Promise.reject(new Error('scanner is a banana'))
  })

  await importer.startImport()
  await importer.waitForEndOfBatchOrScanningPause()

  const batches = await store.batchStatus()
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
  const store = await Store.memoryStore()
  const importer = new SystemImporter({
    ...importDirs.paths,
    store,
    scanner,
  })

  await importer.configure(fromElection(election))
  expect(await store.getElectionDefinition()).toBeDefined()
  await importer.unconfigure()
  expect(await store.getElectionDefinition()).toBeUndefined()
})

test('setTestMode zeroes and sets test mode on the interpreter', async () => {
  const scanner: jest.Mocked<Scanner> = {
    scanSheets: jest.fn(),
  }
  const store = await Store.memoryStore()
  const importer = new SystemImporter({
    ...importDirs.paths,
    store,
    scanner,
  })

  await importer.configure(fromElection(election))
  const batchId = await store.addBatch()
  await store.addSheet(uuid(), batchId, [
    {
      originalFilename: '/tmp/front-page.png',
      normalizedFilename: '/tmp/front-normalized-page.png',
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: {
          locales: { primary: 'en-US' },
          electionHash: '',
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
          electionHash: '',
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

test('restoreConfig reads config data from the store', async () => {
  const scanner: jest.Mocked<Scanner> = {
    scanSheets: jest.fn(),
  }
  const store = await Store.memoryStore()
  const interpreter = makeMockInterpreter()
  const importer = new SystemImporter({
    ...importDirs.paths,
    store,
    scanner,
    interpreter,
  })

  await importer.configure(fromElection(election))
  await store.setTestMode(true)
  await store.addHmpbTemplate(
    Buffer.of(1),
    {
      locales: { primary: 'en-US' },
      electionHash: '',
      ballotType: BallotType.Standard,
      ballotStyleId: '77',
      precinctId: '42',
      isTestMode: true,
    },
    [
      {
        ballotImage: {
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId: '77',
            precinctId: '42',
            isTestMode: true,
            pageNumber: 1,
          },
        },
        contests: [],
      },
      {
        ballotImage: {
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId: '77',
            precinctId: '43',
            isTestMode: true,
            pageNumber: 2,
          },
        },
        contests: [],
      },
    ]
  )

  jest.spyOn(importer, 'configure').mockResolvedValue()
  pdfToImagesMock.mockImplementationOnce(async function* () {
    yield {
      pageNumber: 1,
      pageCount: 2,
      page: { data: Uint8ClampedArray.of(0, 0, 0, 1), width: 1, height: 1 },
    }
    yield {
      pageNumber: 2,
      pageCount: 2,
      page: { data: Uint8ClampedArray.of(0, 0, 0, 2), width: 1, height: 1 },
    }
  })

  await importer.restoreConfig()
  expect(importer.configure).toHaveBeenCalled()
  expect(interpreter.addHmpbTemplate).toHaveBeenCalledTimes(2)
  expect(interpreter.setTestMode).toHaveBeenCalledWith(true)
  await importer.unconfigure()
})

test('cannot add HMPB templates before configuring an election', async () => {
  const scanner: jest.Mocked<Scanner> = {
    scanSheets: jest.fn(),
  }
  const importer = new SystemImporter({
    ...importDirs.paths,
    store: await Store.memoryStore(),
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
    scanSheets: jest.fn(),
  }
  const store = await Store.memoryStore()
  const interpreter = makeMockInterpreter()
  const importer = new SystemImporter({
    ...importDirs.paths,
    store,
    scanner,
    interpreter,
  })

  await store.setElection(fromElection(election))
  interpreter.interpretFile
    .mockResolvedValueOnce({
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: {
          electionHash: '',
          ballotType: BallotType.Standard,
          locales: { primary: 'en-US' },
          ballotStyleId: '77',
          precinctId: '42',
          isTestMode: false,
          pageNumber: 1,
        },
      },
    })
    .mockResolvedValueOnce({
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: {
          electionHash: '',
          ballotType: BallotType.Standard,
          locales: { primary: 'en-US' },
          ballotStyleId: '77',
          precinctId: '42',
          isTestMode: false,
          pageNumber: 2,
        },
      },
    })
  const imageFile = await makeImageFile()
  const sheetId = await importer.importFile(
    await store.addBatch(),
    imageFile,
    imageFile
  )

  const filenames = (await store.getBallotFilenames(sheetId, 'front'))!
  expect(fs.existsSync(filenames.original)).toBe(true)
  expect(fs.existsSync(filenames.normalized)).toBe(true)
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

  const store = await Store.memoryStore()

  const importer = new SystemImporter({
    ...importDirs.paths,
    store,
    scanner,
  })

  await importer.configure(fromElection(election))

  jest.spyOn(store, 'deleteSheet')
  jest.spyOn(store, 'saveBallotAdjudication')

  jest
    .spyOn(store, 'addSheet')
    .mockImplementationOnce(async () => {
      return 'sheet-1'
    })
    .mockImplementationOnce(async () => {
      jest.spyOn(store, 'adjudicationStatus').mockImplementation(async () => {
        return { adjudicated: 0, remaining: 1 }
      })
      return 'sheet-2'
    })
    .mockImplementationOnce(async () => {
      jest.spyOn(store, 'adjudicationStatus').mockImplementation(async () => {
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

  expect(store.addSheet).toHaveBeenCalledTimes(2)

  // wait a bit and make sure no other call is made
  await sleep(1)
  expect(store.addSheet).toHaveBeenCalledTimes(2)

  expect(store.deleteSheet).toHaveBeenCalledTimes(0)

  jest
    .spyOn(store, 'getNextAdjudicationSheet')
    .mockImplementationOnce(mockGetNextAdjudicationSheet)

  jest.spyOn(store, 'adjudicationStatus').mockImplementation(async () => {
    return { adjudicated: 0, remaining: 0 }
  })

  await importer.continueImport()
  await importer.waitForEndOfBatchOrScanningPause()

  expect(store.addSheet).toHaveBeenCalledTimes(3)
  expect(store.deleteSheet).toHaveBeenCalledTimes(1)

  jest
    .spyOn(store, 'getNextAdjudicationSheet')
    .mockImplementationOnce(mockGetNextAdjudicationSheet)

  jest.spyOn(store, 'adjudicationStatus').mockImplementation(async () => {
    return { adjudicated: 0, remaining: 0 }
  })

  await importer.continueImport(true) // override
  await importer.waitForEndOfBatchOrScanningPause()

  expect(store.addSheet).toHaveBeenCalledTimes(3) // no more of these
  expect(store.deleteSheet).toHaveBeenCalledTimes(1) // no more deletes
  expect(store.saveBallotAdjudication).toHaveBeenCalledTimes(2)
})

test('importing a sheet orders HMPB pages', async () => {
  const store = await Store.memoryStore()
  const scanner: jest.Mocked<Scanner> = {
    scanSheets: jest.fn(),
  }
  const interpreter = makeMockInterpreter()

  const importer = new SystemImporter({
    ...importDirs.paths,
    store,
    scanner,
    interpreter,
  })

  importer.configure(fromElection(election))
  jest.spyOn(store, 'addSheet').mockResolvedValueOnce('sheet-id')

  for (const pageNumber of [2, 1]) {
    interpreter.interpretFile.mockResolvedValueOnce({
      interpretation: {
        type: 'InterpretedHmpbPage',
        metadata: {
          ballotStyleId: '1',
          precinctId: '1',
          ballotType: BallotType.Standard,
          electionHash: '',
          isTestMode: false,
          locales: { primary: 'en-US' },
          pageNumber,
        },
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
    })
  }

  const imageFile = await makeImageFile()
  await importer.importFile('batch-id', imageFile, imageFile)

  expect(store.addSheet).toHaveBeenCalledWith(expect.any(String), 'batch-id', [
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
  ])
})
