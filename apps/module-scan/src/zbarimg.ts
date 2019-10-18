import execFile from './exec'

export interface ZBarImage {
  readQRCodeFromImage(filepath: string): Promise<Buffer | undefined>
}

/**
 * Expects our hacked-up version of zbarimg which returns a hex string
 * when it's a binary QR Code
 */
export class RealZBarImage implements ZBarImage {
  public async readQRCodeFromImage(
    filepath: string
  ): Promise<Buffer | undefined> {
    try {
      const { stdout } = await execFile('zbarimg', ['--raw', `${filepath}`])

      if (stdout) {
        return Buffer.from(stdout, 'hex')
      } else {
        return
      }
    } catch {
      return
    }
  }
}
