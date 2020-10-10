import * as oaklawn from '../../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library'
import * as walthall2020 from '../../test/fixtures/walthall-county-2020-general-election-6f6f9cdb30'
import * as choctaw from '../../test/fixtures/choctaw-county-2020-general-election'
import { binarize } from './binarize'
import { getCorners } from './corners'

test('already pretty straight', async () => {
  const imageData = await oaklawn.filledInPage1.imageData()

  binarize(imageData)
  expect(
    getCorners(imageData, {
      bounds: {
        x: 1691,
        y: 1418,
        width: 734,
        height: 648,
      },
    })
  ).toMatchInlineSnapshot(`
    Array [
      Object {
        "x": 1692,
        "y": 1419,
      },
      Object {
        "x": 2424,
        "y": 1418,
      },
      Object {
        "x": 1693,
        "y": 2065,
      },
      Object {
        "x": 2425,
        "y": 2064,
      },
    ]
  `)
})

test('skewed', async () => {
  const imageData = await walthall2020.filledInPage1Skewed.imageData()

  binarize(imageData)
  expect(
    getCorners(imageData, {
      bounds: {
        x: 888,
        y: 78,
        width: 817,
        height: 2801,
      },
    })
  ).toMatchInlineSnapshot(`
    Array [
      Object {
        "x": 942,
        "y": 79,
      },
      Object {
        "x": 1704,
        "y": 95,
      },
      Object {
        "x": 889,
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

  expect(
    getCorners(imageData, {
      bounds: {
        height: 2439,
        width: 1179,
        x: 73,
        y: 83,
      },
    })
  ).toMatchInlineSnapshot(`
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
        "y": 2521,
      },
      Object {
        "x": 1251,
        "y": 2512,
      },
    ]
  `)
})
