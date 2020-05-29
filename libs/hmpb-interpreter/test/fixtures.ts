import { promises as fs } from 'fs'
import { basename, dirname, extname, join } from 'path'
import { BallotPageMetadata, Input } from '../src'
import { vh as flipVH } from '../src/utils/flip'
import { readImageData } from '../src/utils/readImageData'

export class Fixture implements Input {
  public constructor(private basePath: string) {}

  public id(): string {
    return this.filePath()
  }

  public filePath(): string {
    return this.basePath
  }

  public async imageData({ flipped = false } = {}): Promise<ImageData> {
    const imageData = await readImageData(this.filePath())
    if (flipped) {
      flipVH(imageData)
    }
    return imageData
  }

  public async metadata(): Promise<BallotPageMetadata> {
    const imagePath = this.filePath()
    const ext = extname(imagePath)
    const metadataPath = `${join(
      dirname(imagePath),
      basename(imagePath, ext)
    )}-metadata.json`
    return JSON.parse(await fs.readFile(metadataPath, 'utf8'))
  }
}

export const croppedQRCode = new Fixture(
  join(__dirname, 'fixtures/croppedQRCode.jpg')
)
