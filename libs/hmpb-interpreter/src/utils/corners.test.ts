import * as choctaw from '../../test/fixtures/choctaw-county-2020-general-election'
import * as oaklawn from '../../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library'
import * as hamilton from '../../test/fixtures/election-5c6e578acf-state-of-hamilton-2020'
import * as walthall2020 from '../../test/fixtures/walthall-county-2020-general-election-6f6f9cdb30'
import { findShape } from '../hmpb/shapes'
import { binarize } from './binarize'
import { getCorners } from './corners'

test('already pretty straight', async () => {
  const imageData = await oaklawn.filledInPage1.imageData()

  binarize(imageData)
  expect(getCorners(findShape(imageData, { x: 1700, y: 1420 })))
    .toMatchInlineSnapshot(`
    Array [
      Object {
        "x": 1692,
        "y": 1418,
      },
      Object {
        "x": 2423,
        "y": 1419,
      },
      Object {
        "x": 1693,
        "y": 2066,
      },
      Object {
        "x": 2425,
        "y": 2065,
      },
    ]
  `)
})

test('skewed', async () => {
  const imageData = await walthall2020.filledInPage1Skewed.imageData()

  binarize(imageData)
  expect(getCorners(findShape(imageData, { x: 1000, y: 80 })))
    .toMatchInlineSnapshot(`
    Array [
      Object {
        "x": 942,
        "y": 78,
      },
      Object {
        "x": 1704,
        "y": 95,
      },
      Object {
        "x": 888,
        "y": 2864,
      },
      Object {
        "x": 1651,
        "y": 2878,
      },
    ]
  `)
})

test('a little skewed', async () => {
  const imageData = await choctaw.filledInPage2.imageData()
  binarize(imageData)

  expect(getCorners(findShape(imageData, { x: 80, y: 90 })))
    .toMatchInlineSnapshot(`
    Array [
      Object {
        "x": 75,
        "y": 88,
      },
      Object {
        "x": 1237,
        "y": 83,
      },
      Object {
        "x": 86,
        "y": 2522,
      },
      Object {
        "x": 1252,
        "y": 2512,
      },
    ]
  `)
})

test('regression: choctaw county filled-in-p1-01', async () => {
  const imageData = await choctaw.filledInPage1_01.imageData()
  binarize(imageData)

  expect(getCorners(findShape(imageData, { x: 930, y: 90 })))
    .toMatchInlineSnapshot(`
    Array [
      Object {
        "x": 928,
        "y": 86,
      },
      Object {
        "x": 1690,
        "y": 97,
      },
      Object {
        "x": 899,
        "y": 2882,
      },
      Object {
        "x": 1661,
        "y": 2888,
      },
    ]
  `)
})

test('regression: state of hamilton p4', async () => {
  const imageData = await hamilton.filledInPage4.imageData()
  binarize(imageData)

  expect(getCorners(findShape(imageData, { x: 910, y: 140 })))
    .toMatchInlineSnapshot(`
    Array [
      Object {
        "x": 908,
        "y": 140,
      },
      Object {
        "x": 1642,
        "y": 141,
      },
      Object {
        "x": 908,
        "y": 1875,
      },
      Object {
        "x": 1641,
        "y": 1874,
      },
    ]
  `)
})

test('overlapping bounding boxes', async () => {
  const imageData = await choctaw.filledInPage1_06.imageData()
  binarize(imageData)

  expect(getCorners(findShape(imageData, { x: 870, y: 80 })))
    .toMatchInlineSnapshot(`
    Array [
      Object {
        "x": 867,
        "y": 79,
      },
      Object {
        "x": 1630,
        "y": 67,
      },
      Object {
        "x": 924,
        "y": 2868,
      },
      Object {
        "x": 1685,
        "y": 2848,
      },
    ]
  `)
})
