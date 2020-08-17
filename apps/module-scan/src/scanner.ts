import { join } from 'path'
import { streamExecFile } from './exec'
import makeDebug from 'debug'
import { StreamLines } from './util/Lines'

const debug = makeDebug('module-scan:scanner')

export interface ScanIntoOptions {
  directory: string
  prefix?: string
  onFileScanned?: (path: string) => void | Promise<void>
}

export interface Scanner {
  scanInto(options: ScanIntoOptions): Promise<void>
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

  public async scanInto({
    directory,
    prefix,
    onFileScanned,
  }: ScanIntoOptions): Promise<void> {
    const args = [
      '-d',
      'fujitsu',
      '--resolution',
      '300',
      `--format=${this.format}`,
      '--source=ADF Duplex',
      '--swskip',
      '0.5',
      '--dropoutcolor',
      'Red',
      `--batch=${join(
        directory,
        `${prefix}${dateStamp()}-ballot-%04d.${this.format}`
      )}`,
      `--batch-print`,
    ]

    debug(
      'Calling scanimage to scan into %s with prefix=%s in format %s; %s',
      directory,
      prefix,
      this.format,
      `scanimage ${args.map((arg) => `'${arg}'`).join(' ')}`
    )

    const onFileScannedPromises: (void | Promise<void>)[] = []

    await new Promise((resolve, reject) => {
      const scanimage = streamExecFile('scanimage', args)

      debug('scanimage [pid=%d] started', scanimage.pid)

      new StreamLines(scanimage.stdout!).on('line', (line: string) => {
        const path = line.trim()
        debug(
          'scanimage [pid=%d] reported a scanned file: %s',
          scanimage.pid,
          path
        )
        onFileScannedPromises.push(onFileScanned?.(path))
      })

      new StreamLines(scanimage.stderr!).on('line', (line: string) => {
        debug('scanimage [pid=%d] stderr: %s', scanimage.pid, line.trim())
      })

      scanimage.once('exit', (code) => {
        debug('scanimage [pid=%d] exited with code %d', scanimage.pid, code)

        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`scanimage failed with status code ${code}`))
        }
      })
    })

    await Promise.all(onFileScannedPromises)
  }
}
