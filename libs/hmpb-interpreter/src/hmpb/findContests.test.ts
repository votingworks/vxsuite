import {
  filledInPage2_05,
  filledInPage2_07,
} from '../../test/fixtures/choctaw-county-2020-general-election'
import findContests from './findContests'

test('repairs contests with small gaps', async () => {
  expect([
    ...findContests(await filledInPage2_05.imageData(), {
      columns: [true, true],
    }),
  ]).toMatchInlineSnapshot(`
    Array [
      Object {
        "bounds": Object {
          "height": 2434,
          "width": 1246,
          "x": 1,
          "y": 83,
        },
        "corners": Array [
          Object {
            "x": 78,
            "y": 90,
          },
          Object {
            "x": 1236,
            "y": 83,
          },
          Object {
            "x": 83,
            "y": 2516,
          },
          Object {
            "x": 1246,
            "y": 2508,
          },
        ],
      },
      Object {
        "bounds": Object {
          "height": 805,
          "width": 1164,
          "x": 1279,
          "y": 78,
        },
        "corners": Array [
          Object {
            "x": 1279,
            "y": 82,
          },
          Object {
            "x": 2440,
            "y": 78,
          },
          Object {
            "x": 1283,
            "y": 882,
          },
          Object {
            "x": 2440,
            "y": 878,
          },
        ],
      },
      Object {
        "bounds": Object {
          "height": 1135,
          "width": 1166,
          "x": 1283,
          "y": 922,
        },
        "corners": Array [
          Object {
            "x": 1283,
            "y": 926,
          },
          Object {
            "x": 2441,
            "y": 922,
          },
          Object {
            "x": 1287,
            "y": 2056,
          },
          Object {
            "x": 2448,
            "y": 2052,
          },
        ],
      },
    ]
  `)
})

test('handles fold lines sticking out of a contest', async () => {
  expect([
    ...findContests(await filledInPage2_07.imageData(), {
      columns: [true, true],
    }),
  ]).toMatchInlineSnapshot(`
    Array [
      Object {
        "bounds": Object {
          "height": 2434,
          "width": 1241,
          "x": 78,
          "y": 70,
        },
        "corners": Array [
          Object {
            "x": 86,
            "y": 70,
          },
          Object {
            "x": 1252,
            "y": 74,
          },
          Object {
            "x": 83,
            "y": 2501,
          },
          Object {
            "x": 1245,
            "y": 2503,
          },
        ],
      },
      Object {
        "bounds": Object {
          "height": 807,
          "width": 1168,
          "x": 1292,
          "y": 74,
        },
        "corners": Array [
          Object {
            "x": 1295,
            "y": 75,
          },
          Object {
            "x": 2459,
            "y": 79,
          },
          Object {
            "x": 1292,
            "y": 875,
          },
          Object {
            "x": 2457,
            "y": 880,
          },
        ],
      },
      Object {
        "bounds": Object {
          "height": 1135,
          "width": 1170,
          "x": 1289,
          "y": 918,
        },
        "corners": Array [
          Object {
            "x": 1292,
            "y": 918,
          },
          Object {
            "x": 2457,
            "y": 922,
          },
          Object {
            "x": 1289,
            "y": 2049,
          },
          Object {
            "x": 2456,
            "y": 2052,
          },
        ],
      },
    ]
  `)
})
