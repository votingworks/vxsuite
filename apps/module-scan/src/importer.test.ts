import * as chokidar from 'chokidar'
import { electionSample as election } from '@votingworks/ballot-encoder'
import SystemImporter from './importer'
import Store from './store'
import { Scanner } from './scanner'
import makeTemporaryBallotImportImageDirectories, {
  TemporaryBallotImportImageDirectories,
} from './util/makeTemporaryBallotImportImageDirectories'
import { makeMockInterpreter } from '../test/util/mocks'

jest.mock('chokidar')
const mockChokidar = chokidar as jest.Mocked<typeof chokidar>

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
  const importer = new SystemImporter({
    ...importDirs.paths,
    store: await Store.memoryStore(),
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
  await store.addHmpbTemplate(Buffer.of(1), {
    ballotStyleId: '77',
    precinctId: '42',
    isTestBallot: true,
  })
  await store.addHmpbTemplate(Buffer.of(2), {
    ballotStyleId: '77',
    precinctId: '43',
    isTestBallot: true,
  })

  jest.spyOn(importer, 'configure').mockResolvedValue()
  jest.spyOn(importer, 'addHmpbTemplates').mockResolvedValue([])

  await importer.restoreConfig()
  expect(importer.configure).toHaveBeenCalledWith(election)
  expect(importer.addHmpbTemplates).toHaveBeenNthCalledWith(1, Buffer.of(1))
  expect(importer.addHmpbTemplates).toHaveBeenNthCalledWith(2, Buffer.of(2))
  expect(interpreter.setTestMode).toHaveBeenCalledWith(true)
})
