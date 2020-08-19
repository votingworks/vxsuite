import makeDebug from 'debug'
import { join } from 'path'
import { streamExecFile } from './exec'
import { StreamLines } from './util/Lines'
import { dirSync } from 'tmp'
import { queue } from './util/deferred'

const debug = makeDebug('module-scan:scanner')

export type Sheet = [string, string]

export interface Scanner {
  scanSheets(directory?: string): AsyncGenerator<Sheet>
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
  TIFF = 'tiff',
}

/**
 * Scans duplex images in batch mode from a Fujitsu scanner.
 */
export class FujitsuScanner implements Scanner {
  public constructor(private format = ScannerImageFormat.PNG) {}

  public scanSheets(directory = dirSync().name): AsyncGenerator<Sheet> {
    const args = [
      '-d',
      'fujitsu',
      '--resolution',
      '300',
      `--format=${this.format}`,
      '--source=ADF Duplex',
      '--dropoutcolor',
      'Red',
      `--batch=${join(directory, `${dateStamp()}-ballot-%04d.${this.format}`)}`,
      `--batch-print`,
      `--batch-prompt`,
    ]

    debug(
      'Calling scanimage to scan into %s in format %s; %s',
      directory,
      this.format,
      `scanimage ${args.map((arg) => `'${arg}'`).join(' ')}`
    )

    const scannedFiles: string[] = []
    const results = queue<Promise<IteratorResult<Sheet>>>()
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
            value: scannedFiles.slice(-2) as Sheet,
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

    const generator: AsyncGenerator<Sheet> = {
      async next(): Promise<IteratorResult<Sheet>> {
        if (results.isEmpty() && !done) {
          debug(
            'scanimage [pid=%d] sending RETURN twice to scan another sheet',
            scanimage.pid
          )
          scanimage.stdin?.write('\n\n')
        }

        return results.get()
      },

      return(value: unknown): Promise<IteratorResult<Sheet>> {
        if (!done) {
          done = true
          debug(
            'scanimage [pid=%d] generator return called, stopping scan by closing stdin'
          )
          return new Promise((resolve) => {
            scanimage.stdin?.end(() => {
              resolve({ value, done: true })
            })
          })
        }

        return Promise.resolve({ value, done })
      },

      throw(): Promise<IteratorResult<Sheet>> {
        if (!done) {
          done = true
          debug(
            'scanimage [pid=%d] generator throw called, stopping scan by closing stdin'
          )
          return new Promise((resolve) => {
            scanimage.stdin?.end(() => {
              resolve({ value: undefined, done: true })
            })
          })
        }

        return Promise.resolve({ value: undefined, done })
      },

      [Symbol.asyncIterator](): AsyncGenerator<Sheet> {
        return generator
      },
    }

    return generator
  }
}
