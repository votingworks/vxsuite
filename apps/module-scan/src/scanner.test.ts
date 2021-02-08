import { FujitsuScanner, ScannerMode, ScannerPageSize } from './scanner'
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

  scanimage.stderr.append(
    [
      'Scanning infinity pages, incrementing by 1, numbering from 1\n',
      'Place document no. 1 on the scanner.\n',
      'Press <RETURN> to continue.\n',
      'Press Ctrl + D to terminate.\n',
    ].join('')
  )
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

test('fujitsu scanner can scan with letter size', async () => {
  const scanimage = makeMockChildProcess()
  const scanner = new FujitsuScanner({ pageSize: ScannerPageSize.Letter })

  exec.mockReturnValueOnce(scanimage)
  scanner.scanSheets()

  scanimage.stderr.append(
    [
      'Scanning infinity pages, incrementing by 1, numbering from 1\n',
      'Place document no. 1 on the scanner.\n',
      'Press <RETURN> to continue.\n',
      'Press Ctrl + D to terminate.\n',
    ].join('')
  )
  expect(exec).not.toHaveBeenCalledWith(
    'scanimage',
    expect.arrayContaining(['--page-height'])
  )
})

test('fujitsu scanner can scan with legal size', async () => {
  const scanimage = makeMockChildProcess()
  const scanner = new FujitsuScanner({ pageSize: ScannerPageSize.Legal })

  exec.mockReturnValueOnce(scanimage)
  scanner.scanSheets()

  scanimage.stderr.append(
    [
      'Scanning infinity pages, incrementing by 1, numbering from 1\n',
      'Place document no. 1 on the scanner.\n',
      'Press <RETURN> to continue.\n',
      'Press Ctrl + D to terminate.\n',
    ].join('')
  )
  expect(exec).toHaveBeenCalledWith(
    'scanimage',
    expect.arrayContaining(['--page-height'])
  )
})

test('fujitsu scanner does not specify a mode by default', async () => {
  const scanimage = makeMockChildProcess()
  const scanner = new FujitsuScanner()

  exec.mockReturnValueOnce(scanimage)
  scanner.scanSheets()

  scanimage.stderr.append(
    [
      'Scanning infinity pages, incrementing by 1, numbering from 1\n',
      'Place document no. 1 on the scanner.\n',
      'Press <RETURN> to continue.\n',
      'Press Ctrl + D to terminate.\n',
    ].join('')
  )
  expect(exec).not.toHaveBeenCalledWith(
    'scanimage',
    expect.arrayContaining(['--mode'])
  )
})

test('fujitsu scanner can scan with lineart mode', async () => {
  const scanimage = makeMockChildProcess()
  const scanner = new FujitsuScanner({ mode: ScannerMode.Lineart })

  exec.mockReturnValueOnce(scanimage)
  scanner.scanSheets()

  scanimage.stderr.append(
    [
      'Scanning infinity pages, incrementing by 1, numbering from 1\n',
      'Place document no. 1 on the scanner.\n',
      'Press <RETURN> to continue.\n',
      'Press Ctrl + D to terminate.\n',
    ].join('')
  )
  expect(exec).toHaveBeenCalledWith(
    'scanimage',
    expect.arrayContaining(['--mode', 'lineart'])
  )
})

test('fujitsu scanner can scan with gray mode', async () => {
  const scanimage = makeMockChildProcess()
  const scanner = new FujitsuScanner({ mode: ScannerMode.Gray })

  exec.mockReturnValueOnce(scanimage)
  scanner.scanSheets()

  scanimage.stderr.append(
    [
      'Scanning infinity pages, incrementing by 1, numbering from 1\n',
      'Place document no. 1 on the scanner.\n',
      'Press <RETURN> to continue.\n',
      'Press Ctrl + D to terminate.\n',
    ].join('')
  )
  expect(exec).toHaveBeenCalledWith(
    'scanimage',
    expect.arrayContaining(['--mode', 'gray'])
  )
})

test('fujitsu scanner can scan with color mode', async () => {
  const scanimage = makeMockChildProcess()
  const scanner = new FujitsuScanner({ mode: ScannerMode.Color })

  exec.mockReturnValueOnce(scanimage)
  scanner.scanSheets()

  scanimage.stderr.append(
    [
      'Scanning infinity pages, incrementing by 1, numbering from 1\n',
      'Place document no. 1 on the scanner.\n',
      'Press <RETURN> to continue.\n',
      'Press Ctrl + D to terminate.\n',
    ].join('')
  )
  expect(exec).toHaveBeenCalledWith(
    'scanimage',
    expect.arrayContaining(['--mode', 'color'])
  )
})

test('fujitsu scanner requests two images at a time from scanimage', async () => {
  const scanimage = makeMockChildProcess()
  const scanner = new FujitsuScanner()

  exec.mockReturnValueOnce(scanimage)
  const sheets = scanner.scanSheets()

  scanimage.stderr.append(
    [
      'Scanning infinity pages, incrementing by 1, numbering from 1\n',
      'Place document no. 1 on the scanner.\n',
      'Press <RETURN> to continue.\n',
      'Press Ctrl + D to terminate.\n',
    ].join('')
  )
  // scanimage.stdout.append('/tmp/image-0001.png\n')
  // scanimage.stdout.append('/tmp/image-0002.png\n')
  expect(exec).toHaveBeenCalledWith(
    'scanimage',
    expect.arrayContaining(['-d', 'fujitsu'])
  )

  expect(scanimage.stdin?.write).not.toHaveBeenCalled()
  const sheetPromise = sheets.next()
  expect(scanimage.stdin?.write).toHaveBeenCalledWith('\n\n')

  scanimage.stdout.append('/tmp/front.png\n')
  scanimage.stdout.append('/tmp/back.png\n')
  await expect(sheetPromise).resolves.toEqual({
    done: false,
    value: ['/tmp/front.png', '/tmp/back.png'],
  })
})

test('fujitsu scanner ends the scanimage process on generator return', async () => {
  const scanimage = makeMockChildProcess()
  const scanner = new FujitsuScanner()

  exec.mockReturnValueOnce(scanimage)
  const sheets = scanner.scanSheets()

  // we haven't already ended it…
  expect(scanimage.stdin?.end).not.toHaveBeenCalled()

  // but returning ends stdin, telling `scanimage` to exit
  await sheets.return(undefined)
  expect(scanimage.stdin?.end).toHaveBeenCalledTimes(1)

  // returning again doesn't call `end` again
  await sheets.return(undefined)
  expect(scanimage.stdin?.end).toHaveBeenCalledTimes(1)
})

test('fujitsu scanner ends the scanimage process on generator throw', async () => {
  const scanimage = makeMockChildProcess()
  const scanner = new FujitsuScanner()

  exec.mockReturnValueOnce(scanimage)
  const sheets = scanner.scanSheets()

  // we haven't already ended it…
  expect(scanimage.stdin?.end).not.toHaveBeenCalled()

  // but throwing ends stdin, telling `scanimage` to exit
  await sheets.throw(undefined)
  expect(scanimage.stdin?.end).toHaveBeenCalledTimes(1)

  // throwing again doesn't call `end` again
  await sheets.throw(undefined)
  expect(scanimage.stdin?.end).toHaveBeenCalledTimes(1)
})

test('fujitsu scanner fails if scanSheet fails', async () => {
  const scanimage = makeMockChildProcess()
  exec.mockReturnValueOnce(scanimage)

  const scanner = new FujitsuScanner()
  const sheets = scanner.scanSheets()

  scanimage.emit('exit', 1, null)
  await expect(sheets.next()).rejects.toThrowError()
})
