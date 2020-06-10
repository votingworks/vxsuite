import makeDebug from 'debug'
import { promises as fs } from 'fs'
import { extname, join } from 'path'
import { Scanner } from './scanner'

const debug = makeDebug('module-scan:LoopScanner')

/**
 * Provides mock scanning services by copying the same set of images over and
 * over again on demand.
 */
export default class LoopScanner implements Scanner {
  private id = 0
  private imagePaths: string[]

  /**
   * @param imagePaths image paths to "scan" in a repeating sequence
   */
  public constructor(imagePaths: string[]) {
    this.imagePaths = imagePaths
  }

  /**
   * Gets a path to based on an arbitrary non-negative integer. The results of
   * this method, when called sequentially, will cycle through `imagePaths`
   * repeatedly.
   */
  private getImagePathToScanAtOffset(offset: number): string {
    return this.imagePaths[offset % this.imagePaths.length]
  }

  /**
   * "Scans" the next image by copying it into `directory`.
   *
   * @param directory a directory to scan images into; must already exist
   * @param prefix a prefix to use for the scanned filename
   */
  public async scanInto(directory: string, prefix?: string): Promise<void> {
    const { id } = this
    const imagePath = this.getImagePathToScanAtOffset(id)
    const ext = extname(imagePath)
    this.id += 1

    debug(
      `mock scanning %s into %s with prefix '%s'`,
      imagePath,
      directory,
      prefix
    )

    await fs.copyFile(
      imagePath,
      join(directory, prefix ? `${prefix}-${id + 1}${ext}` : `${id + 1}${ext}`)
    )
  }
}
