import * as chokidar from 'chokidar'
import waitForExpect from 'wait-for-expect'
import * as scanner from './scanner'
import election from '../election.json'
import { Election } from './types'
import exec from './exec'

jest.mock('./exec')

jest.mock('chokidar')
const mockChokidar = chokidar as jest.Mocked<typeof chokidar>

test('doScan calls exec with scanimage', async () => {
  scanner.doScan()
  expect(exec).not.toHaveBeenCalled()

  const mockWatcherOn = jest.fn()
  const mockWatcherClose = jest.fn()
  mockChokidar.watch.mockReturnValue(({
    on: mockWatcherOn,
    close: mockWatcherClose,
  } as unknown) as chokidar.FSWatcher)

  scanner.configure(election as Election)

  expect(mockWatcherOn).toHaveBeenCalled()

  scanner.doScan()
  scanner.shutdown()

  expect(mockWatcherClose).toHaveBeenCalled()

  // @ts-ignore
  await waitForExpect(() => {
    expect(exec).toHaveBeenCalled()
  })
})

test('configure starts watching files', () => {
  scanner.configure(election as Election)
})
