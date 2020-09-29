import { randomImage, randomInset } from '../../test/utils'
import { Rect } from '../types'
import { createImageData } from './canvas'
import crop from './crop'

/**
 * A slow-but-accurate implementation of `crop` to compare against.
 */
function cropReferenceImplementation(
  { data: src, width: srcWidth, height: srcHeight }: ImageData,
  bounds: Rect
): ImageData {
  const channels = src.length / (srcWidth * srcHeight)
  const dst = new Uint8ClampedArray(bounds.width * bounds.height * channels)
  const {
    x: srcXOffset,
    y: srcYOffset,
    width: dstWidth,
    height: dstHeight,
  } = bounds

  for (let y = 0; y < dstHeight; y += 1) {
    const srcY = srcYOffset + y

    for (let x = 0; x < dstWidth; x += 1) {
      const srcX = srcXOffset + x
      const srcOffset = (srcX + srcY * srcWidth) * channels
      const dstOffset = (x + y * dstWidth) * channels

      for (let c = 0; c < channels; c += 1) {
        dst[dstOffset + c] = src[srcOffset + c]
      }
    }
  }

  return createImageData(dst, dstWidth, dstHeight)
}

test('crop center (gray)', () => {
  const imageData = {
    data: Uint8ClampedArray.of(0, 0, 0, 0, 1, 0, 0, 0, 0),
    width: 3,
    height: 3,
  }

  const { data, width, height } = crop(imageData, {
    x: 1,
    y: 1,
    width: 1,
    height: 1,
  })
  expect([...data]).toEqual([1])
  expect({ width, height }).toEqual({ width: 1, height: 1 })
})

test('crop center (rgba)', () => {
  const imageData = {
    data: Uint8ClampedArray.of(0, 0, 0, 255, 1, 0, 0, 255),
    width: 2,
    height: 1,
  }

  const { data, width, height } = crop(imageData, {
    x: 1,
    y: 0,
    width: 1,
    height: 1,
  })
  expect([...data]).toEqual([1, 0, 0, 255])
  expect({ width, height }).toEqual({ width: 1, height: 1 })
})

test('crop random (gray)', () => {
  const imageData = randomImage({ channels: 1, maxWidth: 20, maxHeight: 20 })
  const cropBounds = randomInset({
    x: 0,
    y: 0,
    width: imageData.width,
    height: imageData.height,
  })

  const actual = crop(imageData, cropBounds)
  const expected = cropReferenceImplementation(imageData, cropBounds)

  expect({ width: actual.width, height: actual.height }).toEqual({
    width: expected.width,
    height: expected.height,
  })
  expect([...actual.data]).toEqual([...expected.data])
})

test('crop random (rgba)', () => {
  const imageData = randomImage({ channels: 4, maxWidth: 20, maxHeight: 20 })
  const cropBounds = randomInset({
    x: 0,
    y: 0,
    width: imageData.width,
    height: imageData.height,
  })

  const actual = crop(imageData, cropBounds)
  const expected = cropReferenceImplementation(imageData, cropBounds)

  expect({ width: actual.width, height: actual.height }).toEqual({
    width: expected.width,
    height: expected.height,
  })
  expect([...actual.data]).toEqual([...expected.data])
})
