import { join } from 'path'
import execFile from './exec'

export interface Scanner {
  scanInto(directory: string, prefix?: string): Promise<void>
}

function zeroPad(number: number, maxLength: number = 2): string {
  return number.toString().padStart(maxLength, '0')
}

function dateStamp(date: Date = new Date()): string {
  return `${zeroPad(date.getFullYear(), 4)}${zeroPad(
    date.getMonth() + 1
  )}${zeroPad(date.getDay())}_${zeroPad(date.getHours())}${zeroPad(
    date.getMinutes()
  )}${zeroPad(date.getSeconds())}`
}

/**
 * Scans duplex images in batch mode from a Fujitsu scanner.
 */
export class FujitsuScanner implements Scanner {
  public async scanInto(directory: string, prefix = ''): Promise<void> {
    await execFile('scanimage', [
      '-d',
      'fujitsu',
      '--resolution',
      '300',
      '--format=jpeg',
      '--source="ADF Duplex"',
      `--batch=${join(directory, `${prefix}${dateStamp()}-ballot-%04d.jpg`)}`,
    ])
  }
}
