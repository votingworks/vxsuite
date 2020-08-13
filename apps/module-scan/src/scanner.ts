import { join } from 'path'
import { streamExecFile } from './exec'
import makeDebug from 'debug'

const debug = makeDebug('module-scan:scanner')

export interface ScanIntoOptions {
  directory: string
  prefix?: string
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

  public async scanInto({ directory, prefix }: ScanIntoOptions): Promise<void> {
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

    await new Promise((resolve, reject) => {
      const scanimage = streamExecFile('scanimage', args)
      let stdout = ''
      let stderr = ''

      scanimage.stdout?.on('readable', () => {
        if (scanimage.stdout) {
          const chunk = scanimage.stdout.read()
          if (chunk) {
            stdout += chunk
          }
        }
      })

      scanimage.stderr?.on('readable', () => {
        if (scanimage.stderr) {
          const chunk = scanimage.stderr.read()
          if (chunk) {
            stderr += chunk
          }
        }
      })

      scanimage.once('exit', (code) => {
        debug(
          'scanimage exited with code %d and stdout=%o stderr=%o',
          code,
          stdout,
          stderr
        )

        if (code === 0) {
          resolve()
        } else {
          reject()
        }
      })
    })
  }
}
