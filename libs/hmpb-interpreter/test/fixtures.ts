import { join } from 'path'
import { readImageData } from './utils'

export interface Fixture {
  id(): string
  imageData(): Promise<ImageData>
}

const fixture = (filePath: string): Fixture => ({
  id: (): string => filePath,
  imageData: (): Promise<ImageData> => readImageData(filePath),
})

export const templatePage1 = fixture(
  join(__dirname, 'fixtures/template-2020-04-15-0001.jpg')
)
export const templatePage2 = fixture(
  join(__dirname, 'fixtures/template-2020-04-15-0002.jpg')
)
export const yvonneDavis = fixture(
  join(__dirname, 'fixtures/template-2020-04-15-0001-yvonne-davis.jpg')
)
export const fullVotesPage1 = fixture(
  join(__dirname, 'fixtures/template-2020-04-15-0001-full-votes.jpg')
)
export const fullVotesPage2 = fixture(
  join(__dirname, 'fixtures/template-2020-04-15-0002-full-votes.jpg')
)
export const croppedQRCode = fixture(
  join(__dirname, 'fixtures/croppedQRCode.jpg')
)
