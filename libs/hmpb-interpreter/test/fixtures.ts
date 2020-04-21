import { promises as fs } from 'fs'
import { join } from 'path'
import { BallotPageMetadata, Input } from '../src'
import { readImageData } from '../src/utils/readImageData'

class Fixture implements Input {
  public constructor(private basePath: string, private variant?: string) {}

  public id(): string {
    return this.filePath('')
  }

  public filePath(ext: string): string {
    return `${this.basePath}${this.variant ? `-${this.variant}` : ''}${ext}`
  }

  public async imageData(): Promise<ImageData> {
    return await readImageData(this.filePath('.jpg'))
  }

  public async metadata(): Promise<BallotPageMetadata> {
    return JSON.parse(
      await fs.readFile(this.filePath(`-metadata.json`), 'utf8')
    )
  }
}

export const templatePage1 = new Fixture(
  join(__dirname, 'fixtures/template-2020-04-15-0001')
)
export const templatePage2 = new Fixture(
  join(__dirname, 'fixtures/template-2020-04-15-0002')
)
export const yvonneDavis = new Fixture(
  join(__dirname, 'fixtures/template-2020-04-15-0001'),
  'yvonne-davis'
)
export const fullVotesPage1 = new Fixture(
  join(__dirname, 'fixtures/template-2020-04-15-0001'),
  'full-votes'
)
export const fullVotesPage2 = new Fixture(
  join(__dirname, 'fixtures/template-2020-04-15-0002'),
  'full-votes'
)
export const croppedQRCode = new Fixture(
  join(__dirname, 'fixtures/croppedQRCode')
)
