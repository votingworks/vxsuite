import { join } from 'path'
import { readImageData } from './utils'

const fixture = (filePath: string) => ({
  id: () => filePath,
  imageData: () => readImageData(filePath),
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
export const croppedQRCode = fixture(
  join(__dirname, 'fixtures/croppedQRCode.jpg')
)
