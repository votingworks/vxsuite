import makeDebug from 'debug'
import { join } from 'path'
import { dirSync } from 'tmp'
import { streamExecFile } from './exec'
import { SheetOf } from './types'
import { queue } from './util/deferred'
import { StreamLines } from './util/Lines'

const debug = makeDebug('module-scan:scanner')

export interface Scanner {
  scanSheets(directory?: string): AsyncGenerator<SheetOf<string>>
}

function zeroPad(number: number, maxLength = 2): string {
  return number.toString().padStart(maxLength, '0')
}

function dateStamp(date: Date = new Date()): string {
  return `${zeroPad(date.getFullYear(), 4)}${zeroPad(
    date.getMonth() + 1
  )}${zeroPad(date.getDay())}_${zeroPad(date.getHours())}${zeroPad(
    date.getMinutes()
  )}${zeroPad(date.getSeconds())}`
}

export enum ScannerImageFormat {
  JPEG = 'jpeg',
  PNG = 'png',
}

export enum ScannerPageSize {
  Letter = 'letter',
  Legal = 'legal',
}

export enum ScannerMode {
  Lineart = 'lineart',
  Gray = 'gray',
  Color = 'color',
}

export interface Options {
  format?: ScannerImageFormat
  pageSize?: ScannerPageSize
  mode?: ScannerMode
}

/**
 * Scans duplex images in batch mode from a Fujitsu scanner.
 */
export class FujitsuScanner implements Scanner {
  private readonly format: ScannerImageFormat
  private readonly pageSize: ScannerPageSize
  private readonly mode?: ScannerMode

  public constructor({
    format = ScannerImageFormat.JPEG,
    pageSize = ScannerPageSize.Letter,
    mode,
  }: Options = {}) {
    this.format = format
    this.pageSize = pageSize
    this.mode = mode
  }

  public scanSheets(
    directory = dirSync().name
  ): AsyncGenerator<SheetOf<string>> {
    const args: string[] = [
      '-d',
      'fujitsu',
      '--resolution',
      '200',
      `--format=${this.format}`,
      '--source=ADF Duplex',
      '--dropoutcolor',
      'Red',
      `--batch=${join(directory, `${dateStamp()}-ballot-%04d.${this.format}`)}`,
      `--batch-print`,
      `--batch-prompt`,
    ]

    if (this.pageSize === ScannerPageSize.Legal) {
      args.push('--page-width', '215.872', '--page-height', '355.6')
    }

    if (this.mode) {
      args.push('--mode', this.mode)
    }

    debug(
      'Calling scanimage to scan into %s in format %s; %s',
      directory,
      this.format,
      `scanimage ${args.map((arg) => `'${arg}'`).join(' ')}`
    )

    const scannedFiles: string[] = []
    const results = queue<Promise<IteratorResult<SheetOf<string>>>>()
    let done = false
    const scanimage = streamExecFile('scanimage', args)

    debug('scanimage [pid=%d] started', scanimage.pid)

    new StreamLines(scanimage.stdout!).on('line', (line: string) => {
      const path = line.trim()
      debug(
        'scanimage [pid=%d] reported a scanned file: %s',
        scanimage.pid,
        path
      )

      scannedFiles.push(path)
      if (scannedFiles.length % 2 === 0) {
        results.resolve(
          Promise.resolve({
            value: scannedFiles.slice(-2) as SheetOf<string>,
            done: false,
          })
        )
      }
    })

    new StreamLines(scanimage.stderr!).on('line', (line: string) => {
      debug('scanimage [pid=%d] stderr: %s', scanimage.pid, line.trim())
    })

    scanimage.once('exit', (code) => {
      debug('scanimage [pid=%d] exited with code %d', scanimage.pid, code)
      done = true
      if (code !== 0) {
        results.rejectAll(new Error(`scanimage exited with code=${code}`))
      } else {
        results.resolveAll(Promise.resolve({ value: undefined, done }))
      }
    })

    const generator: AsyncGenerator<SheetOf<string>> = {
      async next(): Promise<IteratorResult<SheetOf<string>>> {
        if (results.isEmpty() && !done) {
          debug(
            'scanimage [pid=%d] sending RETURN twice to scan another sheet',
            scanimage.pid
          )
          scanimage.stdin?.write('\n\n')
        }

        return results.get()
      },

      return(value: unknown): Promise<IteratorResult<SheetOf<string>>> {
        if (!done) {
          done = true
          debug(
            'scanimage [pid=%d] generator return called, stopping scan by closing stdin',
            scanimage.pid
          )
          return new Promise((resolve) => {
            scanimage.stdin?.end(() => {
              resolve({ value, done: true })
            })
          })
        }

        return Promise.resolve({ value, done })
      },

      throw(): Promise<IteratorResult<SheetOf<string>>> {
        if (!done) {
          done = true
          debug(
            'scanimage [pid=%d] generator throw called, stopping scan by closing stdin',
            scanimage.pid
          )
          return new Promise((resolve) => {
            scanimage.stdin?.end(() => {
              resolve({ value: undefined, done: true })
            })
          })
        }

        return Promise.resolve({ value: undefined, done })
      },

      /* istanbul ignore next - required by TS, but unclear of what use it is */
      [Symbol.asyncIterator](): AsyncGenerator<SheetOf<string>> {
        return generator
      },
    }

    return generator
  }
}
