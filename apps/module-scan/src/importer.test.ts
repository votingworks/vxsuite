import { electionSample as election } from '@votingworks/ballot-encoder'
import { createImageData } from 'canvas'
import * as fs from 'fs-extra'
import { join } from 'path'
import sharp from 'sharp'
import { fileSync } from 'tmp'
import { v4 as uuid } from 'uuid'
import { makeMockInterpreter } from '../test/util/mocks'
import SystemImporter from './importer'
import { Scanner, Sheet } from './scanner'
import Store from './store'
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
})

test('doImport calls scanner.scanSheet', async () => {
  const scanner: jest.Mocked<Scanner> = {
    scanSheets: jest.fn(),
  }
  const store = await Store.memoryStore()
  const importer = new SystemImporter({
    ...importDirs.paths,
    store,
    scanner,
  })
  await expect(importer.doImport()).rejects.toThrow('no election configuration')

  await importer.configure(election)

  // failed scan
  scanner.scanSheets.mockImplementationOnce(async function* (): AsyncGenerator<
    Sheet
  > {
    yield Promise.reject(new Error('scanner is a banana'))
  })
  await expect(importer.doImport()).rejects.toThrow('scanner is a banana')

  // successful scan
  scanner.scanSheets.mockImplementationOnce(async function* (): AsyncGenerator<
    Sheet
  > {
    yield [
      join(sampleBallotImagesPath, 'sample-batch-1-ballot-1.jpg'),
      join(sampleBallotImagesPath, 'blank-page.png'),
    ]
  })
  await importer.doImport()

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

  await importer.configure(election)
  expect(await store.getElection()).toBeDefined()
  await importer.unconfigure()
  expect(await store.getElection()).toBeUndefined()
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

  await importer.configure(election)
  const batchId = await store.addBatch()
  await store.addBallot(
    uuid(),
    batchId,
    '/tmp/page.png',
    '/tmp/normalized-page.png',
    {
      type: 'UninterpretedHmpbPage',
      metadata: {
        ballotStyleId: '12',
        precinctId: '23',
        isTestBallot: false,
        pageNumber: 1,
        pageCount: 2,
      },
    }
  )
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

  await store.setElection(election)
  await store.setTestMode(true)
  await store.addHmpbTemplate(Buffer.of(1), [
    {
      ballotImage: {
        metadata: {
          ballotStyleId: '77',
          precinctId: '42',
          isTestBallot: true,
          pageNumber: 1,
          pageCount: 2,
        },
      },
      contests: [],
    },
    {
      ballotImage: {
        metadata: {
          ballotStyleId: '77',
          precinctId: '43',
          isTestBallot: true,
          pageNumber: 2,
          pageCount: 2,
        },
      },
      contests: [],
    },
  ])

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
  expect(importer.configure).toHaveBeenCalledWith(
    expect.objectContaining(election)
  )
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
      ballotStyleId: '77',
      precinctId: '42',
      isTestBallot: false,
    })
  ).rejects.toThrowError(
    'cannot add a HMPB template without a configured election'
  )
})

test('manually importing a buffer as a file', async () => {
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

  await store.setElection(election)
  interpreter.interpretFile.mockResolvedValueOnce({
    type: 'UninterpretedHmpbPage',
    metadata: {
      ballotStyleId: '77',
      precinctId: '42',
      isTestBallot: false,
      pageNumber: 1,
      pageCount: 2,
    },
  })
  const imageFile = fileSync()
  await sharp({
    create: { width: 1, height: 1, channels: 3, background: '#000' },
  })
    .png()
    .toFile(imageFile.name)
  const ballotId = (await importer.importFile(
    await store.addBatch(),
    imageFile.name
  ))!

  const filenames = (await store.getBallotFilenames(ballotId))!
  expect(fs.existsSync(filenames.original)).toBe(true)
  expect(fs.existsSync(filenames.normalized)).toBe(true)
})
