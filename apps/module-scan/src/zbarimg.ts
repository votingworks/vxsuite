import execFile from './exec'

interface ZBarImageParams {
  readonly filepath: string
}

export interface ZBarImage {
  readQRCodeFromImage(params: ZBarImageParams): Promise<Buffer | undefined>
}

/**
 * Expects our hacked-up version of zbarimg which returns a hex string
 * when it's a binary QR Code
 */
export class RealZBarImage implements ZBarImage {
  // eslint-disable-next-line class-methods-use-this
  public async readQRCodeFromImage({
    filepath,
  }: ZBarImageParams): Promise<Buffer | undefined> {
    try {
      const { stdout } = await execFile('zbarimg', ['--raw', `${filepath}`])

      if (stdout) {
        return Buffer.from(stdout, 'hex')
      }
    } catch {
      // ignore errors
    }
  }
}
