import * as fixtures from '../../test/fixtures/choctaw-county-2020-general-election'
import { Corners } from '../types'
import { binarize, PIXEL_BLACK, PIXEL_WHITE } from '../utils/binarize'
import { findShape, parseRectangle } from './shapes'

test('target size', async () => {
  const imageData = await fixtures.district5BlankPage1.imageData()
  binarize(imageData)
  expect(findShape(imageData, { x: 451, y: 1325 }).bounds)
    .toMatchInlineSnapshot(`
    Object {
      "height": 22,
      "width": 32,
      "x": 451,
      "y": 1315,
    }
  `)
})

test('parseRectangle with a perfect rectangle', () => {
  expect(
    parseRectangle([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ])
  ).toMatchInlineSnapshot(`
    Object {
      "angles": Array [
        1.5707963267948966,
        1.5707963267948966,
        1.5707963267948966,
        1.5707963267948966,
      ],
      "isRectangle": true,
    }
  `)
})

test('parseRectangle with a slightly skewed rectangle', () => {
  expect(
    parseRectangle([
      { x: 100, y: 100 },
      { x: 200, y: 98 },
      { x: 100, y: 200 },
      { x: 200, y: 198 },
    ])
  ).toMatchInlineSnapshot(`
    Object {
      "angles": Array [
        1.590793660768047,
        1.550798992821746,
        1.550798992821746,
        1.590793660768047,
      ],
      "isRectangle": true,
    }
  `)
})

test('parseRectangle with very skewed rectangle', () => {
  const corners: Corners = [
    { x: 100, y: 100 },
    { x: 200, y: 80 },
    { x: 100, y: 200 },
    { x: 200, y: 180 },
  ]
  expect(parseRectangle(corners)).toMatchInlineSnapshot(`
    Object {
      "angles": Array [
        1.7681918866447774,
        1.373400766945016,
        1.373400766945016,
        1.7681918866447774,
      ],
      "isRectangle": false,
    }
  `)

  // allowed with a really big allowed error
  expect(parseRectangle(corners, { allowedErrorAngle: (30 / 180) * Math.PI }))
    .toMatchInlineSnapshot(`
    Object {
      "angles": Array [
        1.7681918866447774,
        1.373400766945016,
        1.373400766945016,
        1.7681918866447774,
      ],
      "isRectangle": true,
    }
  `)
})

test('findShape skipping gaps', () => {
  const imageData: ImageData = {
    data: Uint8ClampedArray.of(
      ...[PIXEL_WHITE, PIXEL_WHITE, PIXEL_WHITE, PIXEL_WHITE],
      ...[PIXEL_WHITE, PIXEL_BLACK, PIXEL_BLACK, PIXEL_WHITE],
      ...[PIXEL_WHITE, PIXEL_WHITE, PIXEL_WHITE, PIXEL_WHITE],
      ...[PIXEL_WHITE, PIXEL_BLACK, PIXEL_BLACK, PIXEL_WHITE],
      ...[PIXEL_WHITE, PIXEL_WHITE, PIXEL_WHITE, PIXEL_WHITE],
      ...[PIXEL_WHITE, PIXEL_BLACK, PIXEL_BLACK, PIXEL_WHITE],
      ...[PIXEL_WHITE, PIXEL_WHITE, PIXEL_WHITE, PIXEL_WHITE],
      ...[PIXEL_WHITE, PIXEL_WHITE, PIXEL_WHITE, PIXEL_WHITE],
      ...[PIXEL_WHITE, PIXEL_BLACK, PIXEL_BLACK, PIXEL_WHITE]
    ),
    width: 4,
    height: 9,
  }

  // no gap skipping
  expect(findShape(imageData, { x: 1, y: 1 }).bounds).toMatchInlineSnapshot(`
    Object {
      "height": 1,
      "width": 2,
      "x": 1,
      "y": 1,
    }
  `)

  // skip 1px gaps once
  expect(
    findShape(
      imageData,
      { x: 1, y: 1 },
      { maximumSkipDistance: 1, maximumAllowedSkipCount: 1 }
    ).bounds
  ).toMatchInlineSnapshot(`
    Object {
      "height": 3,
      "width": 2,
      "x": 1,
      "y": 1,
    }
  `)

  // skip 1px gaps twice
  expect(
    findShape(
      imageData,
      { x: 1, y: 1 },
      { maximumSkipDistance: 1, maximumAllowedSkipCount: 2 }
    ).bounds
  ).toMatchInlineSnapshot(`
    Object {
      "height": 5,
      "width": 2,
      "x": 1,
      "y": 1,
    }
  `)

  // skip 2px gaps thrice
  expect(
    findShape(
      imageData,
      { x: 1, y: 1 },
      { maximumSkipDistance: 2, maximumAllowedSkipCount: 3 }
    ).bounds
  ).toMatchInlineSnapshot(`
    Object {
      "height": 8,
      "width": 2,
      "x": 1,
      "y": 1,
    }
  `)
})
