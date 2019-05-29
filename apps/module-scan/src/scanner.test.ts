import * as chokidar from 'chokidar'
import waitForExpect from 'wait-for-expect'
import * as scanner from './scanner'
import election from '../election.json'
import { Election } from './types'
import exec from './exec'
import { init } from './store'

jest.mock('chokidar')
const mockChokidar = chokidar as jest.Mocked<typeof chokidar>

let execErrorMessage: string | undefined = undefined
jest.mock('./exec', () => ({
  __esModule: true,
  default: jest.fn((_command, callback) => {
    callback(execErrorMessage)
  }),
}))

beforeAll(done => {
  init(true).then(() => done())
})

test('doScan calls exec with scanimage', async () => {
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
  execErrorMessage = 'problem scanning'
  await expect(scanner.doScan()).rejects.toThrow(execErrorMessage)

  // successful scan
  execErrorMessage = undefined
  await scanner.doScan()

  scanner.unconfigure()

  // @ts-ignore
  await waitForExpect(() => {
    expect(mockWatcherClose).toHaveBeenCalled()
    expect(exec).toHaveBeenCalled()
  })
})

test('configure starts watching files', () => {
  scanner.configure(election as Election)
})
