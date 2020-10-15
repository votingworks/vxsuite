import { readFileSync } from 'fs-extra'
import { join, resolve } from 'path'
import { Scanner } from './scanner'
import { SheetOf } from './types'

type Batch = readonly SheetOf<string>[]

export function parseBatches(
  imagePathsAndBatchSeparators: readonly string[]
): Batch[] {
  const batches: SheetOf<string>[][] = []
  let currentBatch: SheetOf<string>[] = []

  for (let i = 0; i < imagePathsAndBatchSeparators.length; i++) {
    const entry = imagePathsAndBatchSeparators[i].trim()

    if (entry.length === 0) {
      // empty entry is a batch separator
      if (currentBatch.length > 0) {
        batches.push(currentBatch)
      }
      currentBatch = []
    } else if (entry.startsWith('#')) {
      // comment, skip
    } else {
      const frontPath = entry
      const backPath = imagePathsAndBatchSeparators[++i]?.trim() as
        | string
        | undefined

      if (!backPath) {
        throw new Error(
          `expected back image path after front path (${frontPath}), but got nothing`
        )
      }

      currentBatch.push([frontPath, backPath])
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch)
  }

  return batches
}

export function parseBatchesFromEnv(env?: string): Batch[] | undefined {
  if (typeof env === 'undefined') {
    return
  }

  if (env.startsWith('@')) {
    const batchManifestPath = env.slice(1)
    const batches = parseBatches(
      readFileSync(batchManifestPath, 'utf8').split('\n')
    )

    for (const batch of batches) {
      for (const sheet of batch) {
        sheet[0] = resolve(
          process.cwd(),
          join(batchManifestPath, '..'),
          sheet[0]
        )
        sheet[1] = resolve(
          process.cwd(),
          join(batchManifestPath, '..'),
          sheet[1]
        )
      }
    }

    return batches
  }

  return parseBatches(env.split(','))
}

/**
 * Provides mock scanning services by copying the same set of images over and
 * over again on demand.
 */
export default class LoopScanner implements Scanner {
  private nextBatchIndex = 0
  private batches: readonly Batch[]

  /**
   * @param batches lists of front/back pairs of sheets to scan
   */
  public constructor(batches: readonly Batch[]) {
    this.batches = batches
  }

  /**
   * "Scans" the next sheet by returning the paths for the next two images.
   */
  public async *scanSheets(): AsyncGenerator<SheetOf<string>> {
    if (this.nextBatchIndex >= this.batches.length) {
      this.nextBatchIndex = 0
    }

    const currentBatch = this.batches[this.nextBatchIndex++]

    if (currentBatch) {
      for (const sheet of currentBatch) {
        yield sheet
      }
    }
  }
}
