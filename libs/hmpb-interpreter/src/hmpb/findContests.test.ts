import { Interpreter } from '..'
import * as choctaw from '../../test/fixtures/choctaw-county-2020-general-election'
import * as hamilton from '../../test/fixtures/election-5c6e578acf-state-of-hamilton-2020'
import * as marshall from '../../test/fixtures/marshall-county-2020-general-election'
import { writeImageToFile } from '../../test/utils'
import { binarize } from '../utils/binarize'
import { makeDebugImageLogger } from '../utils/logging'
import findContests, { findMatchingContests } from './findContests'

test('rejects contests that read as non-rectangular', async () => {
  expect([
    ...findContests(await choctaw.filledInPage2_05.imageData(), {
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

test('handles fold lines sticking out of a contest', async () => {
  expect([
    ...findContests(await choctaw.filledInPage2_07.imageData(), {
      columns: [true, true],
    }),
  ]).toMatchInlineSnapshot(`
    Array [
      Object {
        "bounds": Object {
          "height": 2434,
          "width": 1237,
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

test('can find contests based on the location of template contests', async () => {
  const interpreter = new Interpreter({
    election: choctaw.election,
    testMode: true,
  })
  const templateImageData = await choctaw.district5BlankPage1.imageData()
  const scannedImageData = await choctaw.filledInPage1_01.imageData()
  const layout = await interpreter.addTemplate(templateImageData)

  binarize(scannedImageData)
  findMatchingContests(scannedImageData, layout)
  await writeImageToFile(scannedImageData, 'debug-findContests.png')
})

test('can handle toner gaps in the contest box', async () => {
  const interpreter = new Interpreter({
    election: choctaw.election,
    testMode: false,
  })
  const templateImageData = await marshall.mtPleasantBlankPage1.imageData()
  const scannedImageData = await marshall.mtPleasantFilledInPage1.imageData()
  const layout = await interpreter.addTemplate(templateImageData)

  binarize(scannedImageData)
  findMatchingContests(scannedImageData, layout)
  await writeImageToFile(scannedImageData, 'debug-findContests-marshall.png')
})

test('can handle lines connecting the boxes', async () => {
  const interpreter = new Interpreter({
    election: hamilton.election,
    testMode: false,
  })
  const templateImageData = await hamilton.blankPage3.imageData()
  const scannedImageData = await hamilton.filledInPage3.imageData()
  const layout = await interpreter.addTemplate(templateImageData)

  binarize(scannedImageData)
  findMatchingContests(scannedImageData, layout)
  await writeImageToFile(scannedImageData, 'debug-findContests-hamilton.png')
})

test('can handle bad skew', async () => {
  const interpreter = new Interpreter({
    election: marshall.election,
    testMode: false,
  })
  const templateImageData = await marshall.redBanksBlankPage2.imageData()
  const scannedImageData = await marshall.redBanksFilledInPage2.imageData()
  const layout = await interpreter.addTemplate(templateImageData)

  binarize(scannedImageData)
  findMatchingContests(scannedImageData, layout, makeDebugImageLogger())
  await writeImageToFile(
    scannedImageData,
    'debug-findContests-marshall-red-banks.png'
  )
})
