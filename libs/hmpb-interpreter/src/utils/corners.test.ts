import * as oaklawn from '../../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library'
import * as walthall2020 from '../../test/fixtures/walthall-county-2020-general-election-6f6f9cdb30'
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
        "x": 1693,
        "y": 1418,
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
        "x": 2424,
        "y": 2065,
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
        "x": 943,
        "y": 78,
      },
      Object {
        "x": 1704,
        "y": 95,
      },
      Object {
        "x": 888,
        "y": 2863,
      },
      Object {
        "x": 1651,
        "y": 2878,
      },
    ]
  `)
})
