import * as chokidar from 'chokidar'
import { electionSample as election } from '@votingworks/ballot-encoder'
import SystemImporter from './importer'
import Store from './store'
import { Scanner } from './scanner'
import makeTemporaryBallotImportImageDirectories, {
  TemporaryBallotImportImageDirectories,
} from './util/makeTemporaryBallotImportImageDirectories'

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

  importer.configure(election)

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
