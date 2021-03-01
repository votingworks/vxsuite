import { croppedQRCode } from '../../../test/fixtures'
import { PIXEL_BLACK, PIXEL_WHITE } from '../binarize'
import { createImageData } from '../canvas'
import crop from '../crop'
import diff, { countPixels, ratio } from './diff'

const imageData: Readonly<ImageData> = createImageData(
  Uint8ClampedArray.of(
    // y=0
    PIXEL_BLACK,
    PIXEL_WHITE,
    PIXEL_WHITE,
    PIXEL_WHITE,
    // y=1
    PIXEL_WHITE,
    PIXEL_BLACK,
    PIXEL_WHITE,
    PIXEL_WHITE,
    // y=2
    PIXEL_WHITE,
    PIXEL_WHITE,
    PIXEL_BLACK,
    PIXEL_WHITE,
    // y=3
    PIXEL_WHITE,
    PIXEL_WHITE,
    PIXEL_WHITE,
    PIXEL_BLACK
  ),
  4,
  4
)

test('images have no diff with themselves', () => {
  expect([...diff(imageData, imageData).data]).toEqual(
    new Array(imageData.data.length).fill(PIXEL_WHITE)
  )
})

test('images have black pixels where compare is black and base is not', () => {
  const base = {
    data: Uint8ClampedArray.of(PIXEL_BLACK, PIXEL_WHITE),
    width: 2,
    height: 1,
  }
  const compare = {
    data: Uint8ClampedArray.of(PIXEL_BLACK, PIXEL_BLACK),
    width: 2,
    height: 1,
  }

  expect([...diff(base, compare).data]).toEqual([PIXEL_WHITE, PIXEL_BLACK])
})

test('bounds may specify a subset of the images to compare', () => {
  const base = {
    data: Uint8ClampedArray.of(PIXEL_BLACK, PIXEL_WHITE),
    width: 2,
    height: 1,
  }
  const compare = {
    data: Uint8ClampedArray.of(PIXEL_BLACK, PIXEL_BLACK),
    width: 2,
    height: 1,
  }

  expect([
    ...diff(
      base,
      compare,
      { x: 1, y: 0, width: 1, height: 1 },
      { x: 0, y: 0, width: 1, height: 1 }
    ).data,
  ]).toEqual([PIXEL_BLACK])
})

test('images have no percentage diff with themselves', () => {
  const imageData = {
    data: Uint8ClampedArray.of(
      PIXEL_BLACK,
      PIXEL_BLACK,
      PIXEL_WHITE,
      PIXEL_WHITE
    ),
    width: 4,
    height: 1,
  }

  expect(ratio(diff(imageData, imageData))).toEqual(0)
})

test('images have diff percentage as ratio of black diff pixels to total pixels', () => {
  const base = {
    data: Uint8ClampedArray.of(PIXEL_BLACK, PIXEL_WHITE),
    width: 2,
    height: 1,
  }
  const compare = {
    data: Uint8ClampedArray.of(PIXEL_BLACK, PIXEL_BLACK),
    width: 2,
    height: 1,
  }

  expect(ratio(diff(base, compare))).toEqual(0.5)
})

test('comparing part of an image to all of another', async () => {
  const base = await croppedQRCode.imageData()
  const compareBounds = { x: 150, y: 80, width: 150, height: 80 }
  const compare = crop(base, compareBounds)
  const diffImage = diff(base, compare, compareBounds, {
    ...compareBounds,
    x: 0,
    y: 0,
  })

  expect(ratio(diffImage)).toBe(0)
})

test('counting pixels', () => {
  expect(countPixels(imageData)).toEqual(
    countPixels(imageData, { color: PIXEL_BLACK })
  )

  expect(countPixels(imageData, { color: PIXEL_WHITE })).toEqual(
    imageData.data.length - countPixels(imageData, { color: PIXEL_BLACK })
  )

  expect(
    countPixels(imageData, {
      color: PIXEL_BLACK,
      bounds: { x: 1, y: 1, width: 1, height: 1 },
    })
  ).toEqual(1)
})
