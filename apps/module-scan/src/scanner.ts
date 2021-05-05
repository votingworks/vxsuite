import { PaperStatus, ScannerClient } from '@votingworks/plustek-sdk'
import { Provider, Result } from '@votingworks/types'
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

export enum ScannerStatus {
  WaitingForPaper = 'WaitingForPaper',
  ReadyToScan = 'ReadyToScan',
  Error = 'Error',
  Unknown = 'Unknown',
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

export class PlustekScanner implements Scanner {
  public constructor(
    private readonly clientProvider: Provider<Result<ScannerClient, Error>>
  ) {}

  public async getStatus(): Promise<ScannerStatus> {
    const clientResult = await this.clientProvider.get()

    if (clientResult.isErr()) {
      debug(
        'PlustekScanner#getStatus: failed to get client: %s',
        clientResult.err()
      )
      return ScannerStatus.Error
    }

    const client = clientResult.unwrap()
    return (await client.getPaperStatus()).mapOrElse(
      () => ScannerStatus.Error,
      (paperStatus) => {
        debug('PlustekScanner#getStatus: got paper status: %s', paperStatus)
        return paperStatus === PaperStatus.VtmDevReadyNoPaper
          ? ScannerStatus.WaitingForPaper
          : paperStatus === PaperStatus.VtmReadyToScan
          ? ScannerStatus.ReadyToScan
          : ScannerStatus.Error
      }
    )
  }

  public scanSheets(directory?: string): BatchControl {
    debug('scanSheets: ignoring directory: %s', directory)
    return {
      scanSheet: async (): Promise<SheetOf<string> | undefined> => {
        debug('PlustekScanner#scanSheet BEGIN')
        const clientResult = await this.clientProvider.get()

        if (clientResult.isErr()) {
          return undefined
        }

        const client = clientResult.unwrap()
        const { files } = (await client.scan()).unwrap()
        return [files[0], files[1]]
      },

      acceptSheet: async (): Promise<boolean> => {
        debug('PlustekScanner#acceptSheet BEGIN')
        const clientResult = await this.clientProvider.get()

        if (clientResult.isErr()) {
          debug(
            'PlustekScanner#acceptSheet failed to get client: %s',
            clientResult.err()
          )
          return false
        }

        const client = clientResult.unwrap()
        const acceptResult = await client.accept()

        if (acceptResult.isErr()) {
          debug('PlustekScanner#acceptSheet failed: %s', acceptResult.err())
          return false
        }

        return (
          (
            await client.waitForStatus({
              status: PaperStatus.NoPaper,
              timeout: 1000,
            })
          )?.ok() === PaperStatus.NoPaper
        )
      },

      reviewSheet: async (): Promise<boolean> => {
        try {
          debug('PlustekScanner#reviewSheet BEGIN')
          const clientResult = await this.clientProvider.get()

          if (clientResult.isErr()) {
            debug(
              'PlustekScanner#reviewSheet failed to get client: %s',
              clientResult.err()
            )
            return false
          }

          const client = clientResult.unwrap()
          const rejectResult = await client.reject({ hold: true })

          if (rejectResult.isErr()) {
            debug('PlustekScanner#reviewSheet failed: %s', rejectResult.err())
            return false
          }

          return (
            (
              await client.waitForStatus({
                status: PaperStatus.VtmReadyToScan,
                timeout: 1000,
              })
            )?.ok() === PaperStatus.VtmReadyToScan
          )
        } finally {
          debug('PlustekScanner#reviewSheet END')
        }
      },

      rejectSheet: async (): Promise<boolean> => {
        debug('PlustekScanner#rejectSheet BEGIN')
        const clientResult = await this.clientProvider.get()

        if (clientResult.isErr()) {
          debug(
            'PlustekScanner#reviewSheet failed to get client: %s',
            clientResult.err()
          )
          return false
        }

        const client = clientResult.unwrap()
        const rejectResult = await client.reject({ hold: false })

        if (rejectResult.isErr()) {
          debug('PlustekScanner#rejectSheet failed: %s', rejectResult.err())
          return false
        }

        return (
          (
            await client.waitForStatus({
              status: PaperStatus.NoPaper,
              timeout: 1000,
            })
          )?.ok() === PaperStatus.NoPaper
        )
      },

      endBatch: async (): Promise<void> => {
        const clientResult = await this.clientProvider.get()

        if (clientResult.isErr()) {
          debug(
            'PlustekScanner#endBatch failed to get client: %s',
            clientResult.err()
          )
          return
        }

        const client = clientResult.unwrap()
        await client.reject({ hold: false })
      },
    }
  }
}
