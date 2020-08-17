import { FujitsuScanner } from './scanner'
import { streamExecFile } from './exec'
import { ChildProcess } from 'child_process'
import { makeMockChildProcess } from '../test/util/mocks'

jest.mock('./exec')

const exec = (streamExecFile as unknown) as jest.MockedFunction<
  (file: string, args: readonly string[]) => ChildProcess
>

test('fujitsu scanner calls scanimage with fujitsu device type', async () => {
  const scanimage = makeMockChildProcess()
  exec.mockReturnValueOnce(scanimage)

  const scanner = new FujitsuScanner()
  const scanTask = scanner.scanInto({ directory: '/tmp' })

  expect(exec).toHaveBeenCalledWith(
    'scanimage',
    expect.arrayContaining(['-d', 'fujitsu'])
  )

  scanimage.emit('exit', 0, null)
  await scanTask
})

test('fujitsu scanner calls onFileScanned callback', async () => {
  const scanimage = makeMockChildProcess()
  exec.mockReturnValueOnce(scanimage)

  const scanner = new FujitsuScanner()
  const onFileScanned = jest.fn()
  const scanTask = scanner.scanInto({ directory: '/tmp', onFileScanned })

  scanimage.stdout.append('/tmp/image-0001.png\n')
  expect(onFileScanned).toHaveBeenNthCalledWith(1, '/tmp/image-0001.png')

  scanimage.emit('exit', 0, null)
  await scanTask
})

test('fujitsu scanner fails if scanInto fails', async () => {
  const scanimage = makeMockChildProcess()
  exec.mockReturnValueOnce(scanimage)

  const scanner = new FujitsuScanner()
  const onFileScanned = jest.fn()
  const scanTask = scanner.scanInto({ directory: '/tmp', onFileScanned })

  scanimage.emit('exit', 1, null)
  await expect(scanTask).rejects.toThrowError()
})
