import { createImageData } from 'canvas'
import { croppedQRCode } from '../../test/fixtures'
import { binarize, RGBA_BLACK, RGBA_WHITE } from './binarize'

test('binarize grayscale', async () => {
  const imageData = createImageData(2, 2)

  imageData.data.set([0, 0, 0, 255], 0)
  imageData.data.set([1, 1, 1, 255], 4)
  imageData.data.set([254, 254, 254, 255], 8)
  imageData.data.set([255, 255, 255, 255], 12)

  binarize(imageData)

  expect([...imageData.data]).toEqual([
    ...RGBA_BLACK,
    ...RGBA_BLACK,
    ...RGBA_WHITE,
    ...RGBA_WHITE,
  ])
})

test('binarize color', async () => {
  const imageData = createImageData(2, 2)

  imageData.data.set([0, 0, 0, 255], 0)
  imageData.data.set([27, 80, 32, 255], 4)
  imageData.data.set([65, 189, 210, 255], 8)
  imageData.data.set([12, 255, 8, 255], 12)

  binarize(imageData)

  expect([...imageData.data]).toEqual([
    ...RGBA_BLACK,
    ...RGBA_BLACK,
    ...RGBA_WHITE,
    ...RGBA_WHITE,
  ])
})

test('threshold', () => {
  const imageData = createImageData(2, 2)

  imageData.data.set([0, 0, 0, 255], 0)
  imageData.data.set([1, 1, 1, 255], 4)
  imageData.data.set([2, 2, 2, 255], 8)
  imageData.data.set([3, 3, 3, 255], 12)

  binarize(imageData, imageData, { threshold: 2 })
  expect([...imageData.data]).toEqual([
    ...RGBA_BLACK,
    ...RGBA_BLACK,
    ...RGBA_WHITE,
    ...RGBA_WHITE,
  ])
})

test('idempotence', async () => {
  const binarized = await croppedQRCode.imageData()
  binarize(binarized)

  const rebinarized = createImageData(binarized.width, binarized.height)
  binarize(binarized, rebinarized)

  expect([...rebinarized.data]).toEqual([...binarized.data])
})
