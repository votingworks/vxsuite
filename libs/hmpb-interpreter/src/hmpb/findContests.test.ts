import { filledInPage2_05 } from '../../test/fixtures/choctaw-county-2020-general-election'
import findContests from './findContests'

test('rejects contests that read as non-rectangular', async () => {
  expect([
    ...findContests(await filledInPage2_05.imageData(), {
      columns: [true, true],
    }),
  ]).toMatchInlineSnapshot(`
    Array [
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
