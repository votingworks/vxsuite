import { createImageData } from './canvas'
import { fromGray, fromRGBA } from './grayscale'

test('fromGray with grayscale image', () => {
  const imageData = createImageData(Uint8ClampedArray.of(127), 1, 1)

  fromGray(imageData)
  expect(imageData).toEqual({
    data: Uint8ClampedArray.of(127),
    width: 1,
    height: 1,
  })
})

test('fromGray with grayscale image copied', () => {
  const src = createImageData(Uint8ClampedArray.of(127), 1, 1)
  const dst = createImageData(
    new Uint8ClampedArray(src.data.length),
    src.width,
    src.height
  )

  fromGray(src, dst)
  expect(dst).toEqual(src)
})

test('fromRGBA with grayscale image', () => {
  const imageData = createImageData(
    Uint8ClampedArray.of(127, 127, 127, 255),
    1,
    1
  )

  fromRGBA(imageData)
  expect(imageData).toEqual({
    data: Uint8ClampedArray.of(127, 127, 127, 255),
    width: 1,
    height: 1,
  })
})

test('fromRGBA with grayscale image copied', () => {
  const src = createImageData(Uint8ClampedArray.of(127, 127, 127, 255), 1, 1)
  const dst = createImageData(
    new Uint8ClampedArray(src.data.length),
    src.width,
    src.height
  )

  fromRGBA(src, dst)
  expect(dst).toEqual(src)
})

test('fromRGBA with color image', () => {
  const imageData = createImageData(Uint8ClampedArray.of(255, 0, 0, 255), 1, 1)

  fromRGBA(imageData)
  expect(imageData).toEqual({
    data: Uint8ClampedArray.of(53, 53, 53, 255),
    width: 1,
    height: 1,
  })
})

test('fromRGBA with color image copied RGBA image', () => {
  const src = createImageData(Uint8ClampedArray.of(255, 0, 0, 255), 1, 1)
  const dst = createImageData(
    new Uint8ClampedArray(src.data.length),
    src.width,
    src.height
  )

  fromRGBA(src, dst)
  expect(dst).toEqual({
    data: Uint8ClampedArray.of(53, 53, 53, 255),
    width: 1,
    height: 1,
  })
})

test('fromRGBA with color image copied to single-channel image', () => {
  const src = createImageData(Uint8ClampedArray.of(255, 0, 0, 255), 1, 1)
  const dst = createImageData(
    new Uint8ClampedArray(src.data.length / 4),
    src.width,
    src.height
  )

  fromRGBA(src, dst)
  expect(dst).toEqual({
    data: Uint8ClampedArray.of(53),
    width: 1,
    height: 1,
  })
})
