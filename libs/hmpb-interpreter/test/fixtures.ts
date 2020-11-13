import { promises as fs } from 'fs'
import { join } from 'path'
import { BallotPageMetadata, Input } from '../src'
import { vh as flipVH } from '../src/utils/flip'
import { loadImageData } from '../src/utils/images'
import { adjacentFile } from '../src/utils/path'

export const adjacentMetadataFile = (imagePath: string): string =>
  adjacentFile('-metadata', imagePath, '.json')

export class Fixture implements Input {
  public constructor(private basePath: string) {}

  public id(): string {
    return this.filePath()
  }

  public filePath(): string {
    return this.basePath
  }

  public async imageData({ flipped = false } = {}): Promise<ImageData> {
    const imageData = await loadImageData(this.filePath())
    if (flipped) {
      flipVH(imageData)
    }
    return imageData
  }

  public async metadata(
    overrides: Partial<BallotPageMetadata> = {}
  ): Promise<BallotPageMetadata> {
    return {
      ...JSON.parse(
        await fs.readFile(adjacentMetadataFile(this.filePath()), 'utf8')
      ),
      ...overrides,
    }
  }
}

export const croppedQRCode = new Fixture(
  join(__dirname, 'fixtures/croppedQRCode.jpg')
)
