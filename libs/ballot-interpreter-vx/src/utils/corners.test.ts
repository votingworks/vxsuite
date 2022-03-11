import {
  skewedLongContest,
  topLeftCornerRegressionTest,
  topRightCornerRegressionTest,
} from '../../test/fixtures';
import * as choctaw from '../../test/fixtures/choctaw-county-2020-general-election';
import * as oaklawn from '../../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library';
import * as hamilton from '../../test/fixtures/election-5c6e578acf-state-of-hamilton-2020';
import * as walthall2020 from '../../test/fixtures/walthall-county-2020-general-election-6f6f9cdb30';
import { findShape } from '../hmpb/shapes';
import { binarize } from './binarize';
import { getCorners } from './corners';

test('already pretty straight', async () => {
  const imageData = await oaklawn.filledInPage1.imageData();

  binarize(imageData);
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
  `);
});

test('skewed', async () => {
  const imageData = await walthall2020.filledInPage1Skewed.imageData();

  binarize(imageData);
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
  `);
});

test('a little skewed', async () => {
  const imageData = await choctaw.p2Skewed.imageData();
  binarize(imageData);

  expect(getCorners(findShape(imageData, { x: 193, y: 53 })))
    .toMatchInlineSnapshot(`
    Array [
      Object {
        "x": 53,
        "y": 51,
      },
      Object {
        "x": 825,
        "y": 46,
      },
      Object {
        "x": 63,
        "y": 1502,
      },
      Object {
        "x": 835,
        "y": 1495,
      },
    ]
  `);
});

test('regression: choctaw county filled-in-p1-01', async () => {
  const imageData = await skewedLongContest.imageData();
  binarize(imageData);

  expect(getCorners(findShape(imageData, { x: 80, y: 30 })))
    .toMatchInlineSnapshot(`
    Array [
      Object {
        "x": 34,
        "y": 27,
      },
      Object {
        "x": 796,
        "y": 38,
      },
      Object {
        "x": 5,
        "y": 2823,
      },
      Object {
        "x": 767,
        "y": 2829,
      },
    ]
  `);
});

test('regression: state of hamilton p4', async () => {
  const imageData = await hamilton.filledInPage4.imageData();
  binarize(imageData);

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
  `);
});

test('overlapping bounding boxes', async () => {
  const imageData = await choctaw.p1OverlappingBoundingBoxes.imageData();
  binarize(imageData);

  expect(getCorners(findShape(imageData, { x: 605, y: 55 })))
    .toMatchInlineSnapshot(`
    Array [
      Object {
        "x": 602,
        "y": 53,
      },
      Object {
        "x": 1110,
        "y": 63,
      },
      Object {
        "x": 562,
        "y": 1982,
      },
      Object {
        "x": 1069,
        "y": 1994,
      },
    ]
  `);
});

test('top-right corner bug', async () => {
  const imageData = await topRightCornerRegressionTest.imageData();
  binarize(imageData);

  expect(getCorners(findShape(imageData, { x: 1170, y: 20 })))
    .toMatchInlineSnapshot(`
    Array [
      Object {
        "x": 18,
        "y": 10,
      },
      Object {
        "x": 1179,
        "y": 12,
      },
      Object {
        "x": 20,
        "y": 817,
      },
      Object {
        "x": 1182,
        "y": 814,
      },
    ]
  `);
});

test('top-left corner bug', async () => {
  const imageData = await topLeftCornerRegressionTest.imageData();
  binarize(imageData);

  expect(getCorners(findShape(imageData, { x: 50, y: 30 })))
    .toMatchInlineSnapshot(`
    Array [
      Object {
        "x": 7,
        "y": 25,
      },
      Object {
        "x": 1170,
        "y": 13,
      },
      Object {
        "x": 23,
        "y": 2453,
      },
      Object {
        "x": 1185,
        "y": 2450,
      },
    ]
  `);
});
