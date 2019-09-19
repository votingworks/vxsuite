import * as fs from 'fs'
import { promisify } from 'util'
import { join } from 'path'
import { Scanner } from './scanner'

const copyFile = promisify(fs.copyFile)

export default class LoopScanner implements Scanner {
  private nextIndex = 0
  private ballotImagePaths: string[]

  public constructor(ballotImagePaths: string[]) {
    this.ballotImagePaths = ballotImagePaths
  }

  private getBallotImagePath(offset: number): string {
    return this.ballotImagePaths[offset % this.ballotImagePaths.length]
  }

  public async scanInto(directory: string, prefix?: string): Promise<void> {
    const id = ++this.nextIndex
    const ballotImagePath = this.getBallotImagePath(id)

    process.stdout.write(
      `mock scanning ${ballotImagePath} into ${directory} with prefix '${prefix}'\n`
    )
    await copyFile(ballotImagePath, join(directory, `${prefix}-${id}`))
  }
}
