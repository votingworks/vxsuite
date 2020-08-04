import * as chokidar from 'chokidar'
import { electionSample as election } from '@votingworks/ballot-encoder'
import SystemImporter from './importer'
import Store from './store'
import { Scanner } from './scanner'
import makeTemporaryBallotImportImageDirectories, {
  TemporaryBallotImportImageDirectories,
} from './util/makeTemporaryBallotImportImageDirectories'
import { makeMockInterpreter } from '../test/util/mocks'
import pdfToImages from './util/pdfToImages'
import { createImageData } from 'canvas'

jest.mock('chokidar')
const mockChokidar = chokidar as jest.Mocked<typeof chokidar>

jest.mock('./util/pdfToImages')
const pdfToImagesMock = pdfToImages as jest.MockedFunction<typeof pdfToImages>

let importDirs: TemporaryBallotImportImageDirectories

beforeEach(() => {
  importDirs = makeTemporaryBallotImportImageDirectories()
})

afterEach(() => {
  importDirs.remove()
})

test('doImport calls scanner.scanInto', async () => {
  const scanner: Scanner = { scanInto: jest.fn() }
  const scannerMock = scanner as jest.Mocked<typeof scanner>
  const store = await Store.memoryStore()
  const importer = new SystemImporter({
    ...importDirs.paths,
    store,
    scanner,
  })
  await expect(importer.doImport()).rejects.toThrow('no election configuration')

  const mockWatcherOn = jest.fn()
  const mockWatcherClose = jest.fn()
  mockChokidar.watch.mockReturnValue(({
    on: mockWatcherOn,
    close: mockWatcherClose,
  } as unknown) as chokidar.FSWatcher)

  await importer.configure(election)

  expect(mockWatcherOn).toHaveBeenCalled()

  // failed scan
  scannerMock.scanInto.mockRejectedValueOnce(new Error('scanner is a banana'))
  await expect(importer.doImport()).rejects.toThrow(
    'problem scanning: scanner is a banana'
  )

  // successful scan
  scannerMock.scanInto.mockResolvedValueOnce()
  await importer.doImport()

  await importer.unconfigure()

  expect(mockWatcherClose).toHaveBeenCalled()
})

test('unconfigure clears all data.', async () => {
  const scanner: Scanner = { scanInto: jest.fn() }
  const store = await Store.memoryStore()
  const importer = new SystemImporter({
    ...importDirs.paths,
    store,
    scanner,
  })

  const ballotContent = new TextEncoder().encode(
    '12.23.1|0|0|0||||||||||||||||.r6UYR4t7hEFMz8ZlMWf1Sw'
  )

  await importer.configure(election)

  await importer.addManualBallot(ballotContent)

  expect((await importer.getStatus()).batches).toHaveLength(1)

  await importer.unconfigure()
  expect((await importer.getStatus()).batches).toHaveLength(0)

  await importer.configure(election)
  expect((await importer.getStatus()).batches).toHaveLength(0)

  await importer.addManualBallot(ballotContent)
  const batches = (await importer.getStatus()).batches
  expect(batches).toHaveLength(1)
  expect(batches[0].id).toEqual(1)
})

test('configure starts watching files', async () => {
  const scanner: Scanner = { scanInto: jest.fn().mockResolvedValue(undefined) }
  const importer = new SystemImporter({
    ...importDirs.paths,
    store: await Store.memoryStore(),
    scanner,
  })
  await importer.configure(election)
  await importer.unconfigure()
})

test('setTestMode zeroes and sets test mode on the interpreter', async () => {
  const scanner: Scanner = { scanInto: jest.fn().mockResolvedValue(undefined) }
  const importer = new SystemImporter({
    ...importDirs.paths,
    store: await Store.memoryStore(),
    scanner,
  })

  await importer.configure(election)
  await importer.addManualBallot(
    new TextEncoder().encode(
      '12.23.1|0|0|0||||||||||||||||.r6UYR4t7hEFMz8ZlMWf1Sw'
    )
  )
  expect((await importer.getStatus()).batches).toHaveLength(1)

  await importer.setTestMode(true)
  expect((await importer.getStatus()).batches).toHaveLength(0)
  await importer.unconfigure()
})

test('restoreConfig reads config data from the store', async () => {
  const scanner: Scanner = { scanInto: jest.fn().mockResolvedValue(undefined) }
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
  expect(importer.configure).toHaveBeenCalledWith(election)
  expect(interpreter.addHmpbTemplate).toHaveBeenCalledTimes(2)
  expect(interpreter.setTestMode).toHaveBeenCalledWith(true)
  await importer.unconfigure()
})

test('cannot add HMPB templates before configuring an election', async () => {
  const scanner: Scanner = { scanInto: jest.fn() }
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
