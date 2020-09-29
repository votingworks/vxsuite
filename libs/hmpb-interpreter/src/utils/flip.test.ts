import { createImageData } from './canvas'
import { vh } from './flip'

test('vh does nothing to 1x1 image (rgba)', () => {
  const image = createImageData(Uint8ClampedArray.of(42, 42, 42, 255), 1, 1)
  vh(image)
  expect([...image.data]).toEqual([42, 42, 42, 255])
})

test('vh does nothing to 1x1 image (gray)', () => {
  const image = createImageData(Uint8ClampedArray.of(42), 1, 1)
  vh(image)
  expect([...image.data]).toEqual([42])
})

test('vh flips images vertically and horizontally (rgba)', () => {
  const pixels = [
    [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
    ],
    [
      [8, 9, 10, 11],
      [12, 13, 14, 15],
    ],
    [
      [16, 17, 18, 19],
      [20, 21, 22, 23],
    ],
  ]
  const image = createImageData(
    Uint8ClampedArray.of(
      ...[...pixels[0][0], ...pixels[0][1]],
      ...[...pixels[1][0], ...pixels[1][1]],
      ...[...pixels[2][0], ...pixels[2][1]]
    ),
    2,
    3
  )

  vh(image)

  expect([...image.data]).toEqual([
    ...[...pixels[2][1], ...pixels[2][0]],
    ...[...pixels[1][1], ...pixels[1][0]],
    ...[...pixels[0][1], ...pixels[0][0]],
  ])
})

test('vh flips images vertically and horizontally (gray)', () => {
  const pixels = [
    [0, 1],
    [2, 3],
    [4, 5],
  ]
  const image = createImageData(
    Uint8ClampedArray.of(
      ...[pixels[0][0], pixels[0][1]],
      ...[pixels[1][0], pixels[1][1]],
      ...[pixels[2][0], pixels[2][1]]
    ),
    2,
    3
  )

  vh(image)

  expect([...image.data]).toEqual([
    ...[pixels[2][1], pixels[2][0]],
    ...[pixels[1][1], pixels[1][0]],
    ...[pixels[0][1], pixels[0][0]],
  ])
})

test('flipping twice yields the same image (rgba)', () => {
  const pixels = [
    [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
    ],
    [
      [8, 9, 10, 11],
      [12, 13, 14, 15],
    ],
    [
      [16, 17, 18, 19],
      [20, 21, 22, 23],
    ],
  ]
  const image = createImageData(
    Uint8ClampedArray.of(
      ...[...pixels[0][0], ...pixels[0][1]],
      ...[...pixels[1][0], ...pixels[1][1]],
      ...[...pixels[2][0], ...pixels[2][1]]
    ),
    2,
    3
  )

  vh(image)
  vh(image)

  expect([...image.data]).toEqual([
    ...[...pixels[0][0], ...pixels[0][1]],
    ...[...pixels[1][0], ...pixels[1][1]],
    ...[...pixels[2][0], ...pixels[2][1]],
  ])
})

test('flipping twice yields the same image (gray)', () => {
  const pixels = [
    [0, 1],
    [2, 3],
    [4, 5],
  ]
  const image = createImageData(
    Uint8ClampedArray.of(
      ...[pixels[0][0], pixels[0][1]],
      ...[pixels[1][0], pixels[1][1]],
      ...[pixels[2][0], pixels[2][1]]
    ),
    2,
    3
  )

  vh(image)
  vh(image)

  expect([...image.data]).toEqual([
    ...[pixels[0][0], pixels[0][1]],
    ...[pixels[1][0], pixels[1][1]],
    ...[pixels[2][0], pixels[2][1]],
  ])
})
