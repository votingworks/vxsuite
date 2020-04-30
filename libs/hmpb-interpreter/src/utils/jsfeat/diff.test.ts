import diff, { ratio } from './diff'
import { PIXEL_BLACK, PIXEL_WHITE } from '../binarize'

test('images have no diff with themselves', () => {
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

  expect([...diff(imageData, imageData).data]).toEqual([
    PIXEL_WHITE,
    PIXEL_WHITE,
    PIXEL_WHITE,
    PIXEL_WHITE,
  ])
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

  expect(ratio(imageData, imageData)).toEqual(0)
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

  expect(ratio(base, compare)).toEqual(0.5)
})
