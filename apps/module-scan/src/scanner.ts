import { ScannerStatus } from '@votingworks/types/api/module-scan'
import makeDebug from 'debug'
import { join } from 'path'
import { dirSync } from 'tmp'
import { streamExecFile } from './exec'
import { SheetOf } from './types'
import { queue } from './util/deferred'
import { StreamLines } from './util/Lines'

const debug = makeDebug('module-scan:scanner')

export interface BatchControl {
  scanSheet(): Promise<SheetOf<string> | undefined>
  acceptSheet(): Promise<boolean>
  reviewSheet(): Promise<boolean>
  rejectSheet(): Promise<boolean>
  endBatch(): Promise<void>
}

export interface Scanner {
  getStatus(): Promise<ScannerStatus>
  scanSheets(directory?: string): BatchControl
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

  public async getStatus(): Promise<ScannerStatus> {
    return ScannerStatus.Unknown
  }

  public scanSheets(directory = dirSync().name): BatchControl {
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
    const results = queue<Promise<SheetOf<string> | undefined>>()
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
          Promise.resolve(scannedFiles.slice(-2) as SheetOf<string>)
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
        results.resolveAll(Promise.resolve(undefined))
      }
    })

    return {
      scanSheet: async (): Promise<SheetOf<string> | undefined> => {
        if (results.isEmpty() && !done) {
          debug(
            'scanimage [pid=%d] sending RETURN twice to scan another sheet',
            scanimage.pid
          )
          scanimage.stdin?.write('\n\n')
        }

        return results.get()
      },

      acceptSheet: async (): Promise<boolean> => {
        return true
      },

      reviewSheet: async (): Promise<boolean> => {
        return false
      },

      rejectSheet: async (): Promise<boolean> => {
        return false
      },

      endBatch: async (): Promise<void> => {
        if (!done) {
          done = true
          debug(
            'scanimage [pid=%d] stopping scan by closing stdin',
            scanimage.pid
          )
          await new Promise<void>((resolve) => {
            scanimage.stdin?.end(() => {
              resolve()
            })
          })
        }
      },
    }
  }
}
