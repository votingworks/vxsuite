import {
  foldMakesContestTooWide,
  strayMarkMakesContestTooWide,
} from '../../test/fixtures/stray-marks'
import findContests from './findContests'

test('folds that make contests too wide can be corrected', async () => {
  expect([
    ...findContests(await foldMakesContestTooWide.imageData(), {
      columns: [true, true],
    }),
  ]).toMatchInlineSnapshot(`
    Array [
      Object {
        "bounds": Object {
          "height": 2443,
          "width": 1240,
          "x": 1,
          "y": 85,
        },
        "corners": Array [
          Object {
            "x": 55,
            "y": 98,
          },
          Object {
            "x": 1214,
            "y": 85,
          },
          Object {
            "x": 79,
            "y": 2527,
          },
          Object {
            "x": 1240,
            "y": 2515,
          },
        ],
      },
      Object {
        "bounds": Object {
          "height": 816,
          "width": 1172,
          "x": 1258,
          "y": 71,
        },
        "corners": Array [
          Object {
            "x": 1258,
            "y": 85,
          },
          Object {
            "x": 2420,
            "y": 71,
          },
          Object {
            "x": 1267,
            "y": 886,
          },
          Object {
            "x": 2429,
            "y": 874,
          },
        ],
      },
      Object {
        "bounds": Object {
          "height": 1145,
          "width": 1175,
          "x": 1267,
          "y": 917,
        },
        "corners": Array [
          Object {
            "x": 1267,
            "y": 930,
          },
          Object {
            "x": 2429,
            "y": 917,
          },
          Object {
            "x": 1279,
            "y": 2061,
          },
          Object {
            "x": 2441,
            "y": 2049,
          },
        ],
      },
    ]
  `)
})

test('stray marks that make the contest too wide can be corrected', async () => {
  expect([
    ...findContests(await strayMarkMakesContestTooWide.imageData(), {
      columns: [true, true],
    }),
  ]).toMatchInlineSnapshot(`
    Array [
      Object {
        "bounds": Object {
          "height": 2459,
          "width": 1211,
          "x": 71,
          "y": 100,
        },
        "corners": Array [
          Object {
            "x": 71,
            "y": 121,
          },
          Object {
            "x": 1234,
            "y": 100,
          },
          Object {
            "x": 117,
            "y": 2558,
          },
          Object {
            "x": 1281,
            "y": 2539,
          },
        ],
      },
      Object {
        "bounds": Object {
          "height": 831,
          "width": 1178,
          "x": 1277,
          "y": 77,
        },
        "corners": Array [
          Object {
            "x": 1277,
            "y": 99,
          },
          Object {
            "x": 2438,
            "y": 77,
          },
          Object {
            "x": 1294,
            "y": 907,
          },
          Object {
            "x": 2454,
            "y": 886,
          },
        ],
      },
      Object {
        "bounds": Object {
          "height": 1155,
          "width": 1249,
          "x": 1295,
          "y": 930,
        },
        "corners": Array [
          Object {
            "x": 1295,
            "y": 951,
          },
          Object {
            "x": 2455,
            "y": 930,
          },
          Object {
            "x": 1316,
            "y": 2084,
          },
          Object {
            "x": 2480,
            "y": 2065,
          },
        ],
      },
    ]
  `)
})
