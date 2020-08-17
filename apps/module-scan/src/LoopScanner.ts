import { Scanner, Sheet } from './scanner'
import { NonEmptyArray } from './types'

/**
 * Provides mock scanning services by copying the same set of images over and
 * over again on demand.
 */
export default class LoopScanner implements Scanner {
  private id = 0
  private imagePaths: Readonly<NonEmptyArray<string>>

  /**
   * @param imagePaths image paths to "scan" in a repeating sequence
   */
  public constructor(imagePaths: Readonly<NonEmptyArray<string>>) {
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
   * "Scans" the next sheet by returning the paths for the next two images.
   */
  public async *scanSheets(): AsyncGenerator<Sheet> {
    yield [
      this.getImagePathToScanAtOffset(this.id++),
      this.getImagePathToScanAtOffset(this.id++),
    ]
  }
}
