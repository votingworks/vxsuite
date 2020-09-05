import {
  electionSample as election,
  BallotType,
} from '@votingworks/ballot-encoder'
import { createImageData } from 'canvas'
import * as fs from 'fs-extra'
import { join } from 'path'
import sharp from 'sharp'
import { fileSync } from 'tmp'
import { v4 as uuid } from 'uuid'
import { makeMockInterpreter } from '../test/util/mocks'
import SystemImporter, { sleep } from './importer'
import { Scanner } from './scanner'
import Store from './store'
import makeTemporaryBallotImportImageDirectories, {
  TemporaryBallotImportImageDirectories,
} from './util/makeTemporaryBallotImportImageDirectories'
import pdfToImages from './util/pdfToImages'
import { SheetOf, ReviewUninterpretableHmpbBallot } from './types'
import { fromElection } from './util/electionDefinition'

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
      join(sampleBallotImagesPath, 'sample-batch-1-ballot-1.jpg'),
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
      page: createImageData(Uint8ClampedArray.of(0, 0, 0, 1), 1, 1),
    }
    yield {
      pageNumber: 2,
      pageCount: 2,
      page: createImageData(Uint8ClampedArray.of(0, 0, 0, 2), 1, 1),
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
  const imageFile = fileSync()
  await sharp({
    create: { width: 1, height: 1, channels: 3, background: '#000' },
  })
    .png()
    .toFile(imageFile.name)
  const sheetId = await importer.importFile(
    await store.addBatch(),
    imageFile.name,
    imageFile.name
  )

  const filenames = (await store.getBallotFilenames(sheetId, 'front'))!
  expect(fs.existsSync(filenames.original)).toBe(true)
  expect(fs.existsSync(filenames.normalized)).toBe(true)
})

test('scanning pauses on adjudication then continues', async () => {
  const scanner: jest.Mocked<Scanner> = {
    scanSheets: jest.fn(),
  }
  const mockGetNextReviewBallot = async (): Promise<
    ReviewUninterpretableHmpbBallot
  > => {
    return {
      type: 'ReviewUninterpretableHmpbBallot',
      contests: [],
      ballot: {
        id: 'mock-sheet-id',
        url: '/mock/url',
        image: {
          url: '/mock/image/url',
          width: 100,
          height: 200,
        },
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
      join(sampleBallotImagesPath, 'sample-batch-1-ballot-1.jpg'),
      join(sampleBallotImagesPath, 'blank-page.png'),
    ]

    yield [
      join(sampleBallotImagesPath, 'sample-batch-1-ballot-2.jpg'),
      join(sampleBallotImagesPath, 'blank-page.png'),
    ]

    yield [
      join(sampleBallotImagesPath, 'sample-batch-1-ballot-3.jpg'),
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
    .spyOn(store, 'getNextReviewBallot')
    .mockImplementationOnce(mockGetNextReviewBallot)

  jest.spyOn(store, 'adjudicationStatus').mockImplementation(async () => {
    return { adjudicated: 0, remaining: 0 }
  })

  await importer.continueImport()
  await importer.waitForEndOfBatchOrScanningPause()

  expect(store.addSheet).toHaveBeenCalledTimes(3)
  expect(store.deleteSheet).toHaveBeenCalledTimes(1)

  jest
    .spyOn(store, 'getNextReviewBallot')
    .mockImplementationOnce(mockGetNextReviewBallot)

  jest.spyOn(store, 'adjudicationStatus').mockImplementation(async () => {
    return { adjudicated: 0, remaining: 0 }
  })

  await importer.continueImport(true) // override
  await importer.waitForEndOfBatchOrScanningPause()

  expect(store.addSheet).toHaveBeenCalledTimes(3) // no more of these
  expect(store.deleteSheet).toHaveBeenCalledTimes(1) // no more deletes
  expect(store.saveBallotAdjudication).toHaveBeenCalledTimes(2)
})
