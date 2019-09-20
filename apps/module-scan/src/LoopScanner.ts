import * as fs from 'fs'
import { promisify } from 'util'
import { join } from 'path'
import { Scanner } from './scanner'

const copyFile = promisify(fs.copyFile)

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
    const id = ++this.id
    const imagePath = this.getImagePathToScanAtOffset(id)

    process.stdout.write(
      `mock scanning ${imagePath} into ${directory} with prefix '${prefix}'\n`
    )
    await copyFile(imagePath, join(directory, `${prefix}-${id}`))
  }
}
