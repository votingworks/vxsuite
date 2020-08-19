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
  const scanner = new FujitsuScanner()

  exec.mockReturnValueOnce(scanimage)
  const sheets = scanner.scanSheets()

  scanimage.stdout.append('/tmp/image-0001.png\n')
  scanimage.stdout.append('/tmp/image-0002.png\n')
  expect(exec).toHaveBeenCalledWith(
    'scanimage',
    expect.arrayContaining(['-d', 'fujitsu'])
  )

  scanimage.emit('exit', 0, null)
  await expect(sheets.next()).resolves.toEqual({
    value: ['/tmp/image-0001.png', '/tmp/image-0002.png'],
    done: false,
  })
  await expect(sheets.next()).resolves.toEqual({
    value: undefined,
    done: true,
  })
})

test('fujitsu scanner fails if scanSheet fails', async () => {
  const scanimage = makeMockChildProcess()
  exec.mockReturnValueOnce(scanimage)

  const scanner = new FujitsuScanner()
  const sheets = scanner.scanSheets()

  scanimage.emit('exit', 1, null)
  await expect(sheets.next()).rejects.toThrowError()
})
