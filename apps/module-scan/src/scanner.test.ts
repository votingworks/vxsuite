import * as chokidar from 'chokidar'
import SystemScanner from './scanner'
import election from '../election.json'
import { Election } from './types'
import exec from './exec'
import Store from './store'

jest.mock('chokidar')
const mockChokidar = chokidar as jest.Mocked<typeof chokidar>

jest.mock('./exec')

const execMock = exec as jest.MockedFunction<typeof exec>

test('doScan calls exec with scanimage', async () => {
  const scanner = new SystemScanner({ store: await Store.memoryStore() })
  await expect(scanner.doScan()).rejects.toThrow('no election configuration')

  const mockWatcherOn = jest.fn()
  const mockWatcherClose = jest.fn()
  mockChokidar.watch.mockReturnValue(({
    on: mockWatcherOn,
    close: mockWatcherClose,
  } as unknown) as chokidar.FSWatcher)

  scanner.configure(election as Election)

  expect(mockWatcherOn).toHaveBeenCalled()

  // failed scan
  execMock.mockRejectedValueOnce(new Error())
  await expect(scanner.doScan()).rejects.toThrow('problem scanning')

  // successful scan
  execMock.mockResolvedValueOnce({ stdout: '', stderr: '' })
  await scanner.doScan()

  await scanner.unconfigure()

  // await waitForExpect(() => {
  expect(mockWatcherClose).toHaveBeenCalled()
  expect(exec).toHaveBeenCalled()
  // })
})

test('configure starts watching files', async () => {
  new SystemScanner({ store: await Store.memoryStore() }).configure(
    election as Election
  )
})
