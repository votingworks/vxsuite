import {
  fullVotesPage1,
  fullVotesPage2,
  templatePage1,
  templatePage2,
  yvonneDavis,
} from '../test/fixtures'
import election from '../test/fixtures/election'
import Interpreter from './Interpreter'
import { DetectQRCodeResult } from './types'
import { vh as flipVH } from './utils/flip'

test('interpret two-column template', async () => {
  const interpreter = new Interpreter(election)
  const imageData = await templatePage1.imageData()
  const template = await interpreter.interpretTemplate(imageData)

  expect(template.ballotImage.metadata).toMatchInlineSnapshot(`
    Object {
      "ballotStyleId": "77",
      "isTestBallot": true,
      "pageCount": 2,
      "pageNumber": 1,
      "precinctId": "42",
    }
  `)

  expect(template.contests).toMatchInlineSnapshot(`
    Array [
      Object {
        "bounds": Object {
          "height": 1142,
          "width": 729,
          "x": 935,
          "y": 127,
        },
        "corners": Array [
          Object {
            "x": 937,
            "y": 127,
          },
          Object {
            "x": 1663,
            "y": 136,
          },
          Object {
            "x": 937,
            "y": 1268,
          },
          Object {
            "x": 1663,
            "y": 1268,
          },
        ],
        "options": Array [
          Object {
            "bounds": Object {
              "height": 152,
              "width": 729,
              "x": 935,
              "y": 365,
            },
            "target": Object {
              "bounds": Object {
                "height": 43,
                "width": 63,
                "x": 981,
                "y": 370,
              },
              "inner": Object {
                "height": 28,
                "width": 49,
                "x": 988,
                "y": 377,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 150,
              "width": 729,
              "x": 935,
              "y": 517,
            },
            "target": Object {
              "bounds": Object {
                "height": 42,
                "width": 63,
                "x": 981,
                "y": 522,
              },
              "inner": Object {
                "height": 28,
                "width": 49,
                "x": 988,
                "y": 529,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 150,
              "width": 729,
              "x": 935,
              "y": 667,
            },
            "target": Object {
              "bounds": Object {
                "height": 42,
                "width": 63,
                "x": 981,
                "y": 672,
              },
              "inner": Object {
                "height": 28,
                "width": 49,
                "x": 988,
                "y": 679,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 151,
              "width": 729,
              "x": 935,
              "y": 817,
            },
            "target": Object {
              "bounds": Object {
                "height": 42,
                "width": 63,
                "x": 981,
                "y": 822,
              },
              "inner": Object {
                "height": 28,
                "width": 48,
                "x": 989,
                "y": 829,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 151,
              "width": 729,
              "x": 935,
              "y": 968,
            },
            "target": Object {
              "bounds": Object {
                "height": 43,
                "width": 63,
                "x": 982,
                "y": 973,
              },
              "inner": Object {
                "height": 29,
                "width": 49,
                "x": 989,
                "y": 980,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 145,
              "width": 729,
              "x": 935,
              "y": 1120,
            },
            "target": Object {
              "bounds": Object {
                "height": 42,
                "width": 63,
                "x": 982,
                "y": 1124,
              },
              "inner": Object {
                "height": 28,
                "width": 49,
                "x": 989,
                "y": 1131,
              },
            },
          },
        ],
      },
      Object {
        "bounds": Object {
          "height": 605,
          "width": 728,
          "x": 937,
          "y": 1310,
        },
        "corners": Array [
          Object {
            "x": 937,
            "y": 1312,
          },
          Object {
            "x": 1663,
            "y": 1310,
          },
          Object {
            "x": 938,
            "y": 1914,
          },
          Object {
            "x": 1664,
            "y": 1913,
          },
        ],
        "options": Array [
          Object {
            "bounds": Object {
              "height": 151,
              "width": 728,
              "x": 937,
              "y": 1611,
            },
            "target": Object {
              "bounds": Object {
                "height": 43,
                "width": 63,
                "x": 983,
                "y": 1616,
              },
              "inner": Object {
                "height": 29,
                "width": 49,
                "x": 990,
                "y": 1623,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 148,
              "width": 728,
              "x": 937,
              "y": 1763,
            },
            "target": Object {
              "bounds": Object {
                "height": 42,
                "width": 63,
                "x": 983,
                "y": 1767,
              },
              "inner": Object {
                "height": 29,
                "width": 49,
                "x": 990,
                "y": 1773,
              },
            },
          },
        ],
      },
      Object {
        "bounds": Object {
          "height": 599,
          "width": 729,
          "x": 938,
          "y": 1955,
        },
        "corners": Array [
          Object {
            "x": 938,
            "y": 1969,
          },
          Object {
            "x": 1659,
            "y": 1955,
          },
          Object {
            "x": 940,
            "y": 2553,
          },
          Object {
            "x": 1666,
            "y": 2552,
          },
        ],
        "options": Array [
          Object {
            "bounds": Object {
              "height": 151,
              "width": 729,
              "x": 938,
              "y": 2254,
            },
            "target": Object {
              "bounds": Object {
                "height": 43,
                "width": 62,
                "x": 985,
                "y": 2259,
              },
              "inner": Object {
                "height": 29,
                "width": 49,
                "x": 992,
                "y": 2266,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 144,
              "width": 729,
              "x": 938,
              "y": 2406,
            },
            "target": Object {
              "bounds": Object {
                "height": 42,
                "width": 63,
                "x": 985,
                "y": 2410,
              },
              "inner": Object {
                "height": 28,
                "width": 49,
                "x": 992,
                "y": 2417,
              },
            },
          },
        ],
      },
      Object {
        "bounds": Object {
          "height": 548,
          "width": 729,
          "x": 1704,
          "y": 128,
        },
        "corners": Array [
          Object {
            "x": 1705,
            "y": 128,
          },
          Object {
            "x": 2432,
            "y": 129,
          },
          Object {
            "x": 1705,
            "y": 675,
          },
          Object {
            "x": 2428,
            "y": 675,
          },
        ],
        "options": Array [
          Object {
            "bounds": Object {
              "height": 151,
              "width": 729,
              "x": 1704,
              "y": 429,
            },
            "target": Object {
              "bounds": Object {
                "height": 43,
                "width": 63,
                "x": 1750,
                "y": 434,
              },
              "inner": Object {
                "height": 29,
                "width": 49,
                "x": 1757,
                "y": 441,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 91,
              "width": 729,
              "x": 1704,
              "y": 582,
            },
            "target": Object {
              "bounds": Object {
                "height": 42,
                "width": 63,
                "x": 1750,
                "y": 585,
              },
              "inner": Object {
                "height": 28,
                "width": 49,
                "x": 1757,
                "y": 592,
              },
            },
          },
        ],
      },
      Object {
        "bounds": Object {
          "height": 549,
          "width": 729,
          "x": 1704,
          "y": 716,
        },
        "corners": Array [
          Object {
            "x": 1704,
            "y": 727,
          },
          Object {
            "x": 2429,
            "y": 716,
          },
          Object {
            "x": 1706,
            "y": 1264,
          },
          Object {
            "x": 2432,
            "y": 1263,
          },
        ],
        "options": Array [
          Object {
            "bounds": Object {
              "height": 150,
              "width": 729,
              "x": 1704,
              "y": 1016,
            },
            "target": Object {
              "bounds": Object {
                "height": 43,
                "width": 64,
                "x": 1750,
                "y": 1021,
              },
              "inner": Object {
                "height": 28,
                "width": 50,
                "x": 1757,
                "y": 1028,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 94,
              "width": 729,
              "x": 1704,
              "y": 1168,
            },
            "target": Object {
              "bounds": Object {
                "height": 42,
                "width": 63,
                "x": 1751,
                "y": 1171,
              },
              "inner": Object {
                "height": 28,
                "width": 49,
                "x": 1758,
                "y": 1178,
              },
            },
          },
        ],
      },
      Object {
        "bounds": Object {
          "height": 636,
          "width": 731,
          "x": 1705,
          "y": 1305,
        },
        "corners": Array [
          Object {
            "x": 1705,
            "y": 1334,
          },
          Object {
            "x": 2432,
            "y": 1305,
          },
          Object {
            "x": 1707,
            "y": 1940,
          },
          Object {
            "x": 2435,
            "y": 1939,
          },
        ],
        "options": Array [
          Object {
            "bounds": Object {
              "height": 150,
              "width": 731,
              "x": 1705,
              "y": 1544,
            },
            "target": Object {
              "bounds": Object {
                "height": 42,
                "width": 63,
                "x": 1752,
                "y": 1549,
              },
              "inner": Object {
                "height": 28,
                "width": 49,
                "x": 1759,
                "y": 1556,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 150,
              "width": 731,
              "x": 1705,
              "y": 1694,
            },
            "target": Object {
              "bounds": Object {
                "height": 42,
                "width": 63,
                "x": 1752,
                "y": 1699,
              },
              "inner": Object {
                "height": 28,
                "width": 49,
                "x": 1759,
                "y": 1706,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 92,
              "width": 731,
              "x": 1705,
              "y": 1846,
            },
            "target": Object {
              "bounds": Object {
                "height": 43,
                "width": 63,
                "x": 1753,
                "y": 1849,
              },
              "inner": Object {
                "height": 29,
                "width": 50,
                "x": 1759,
                "y": 1856,
              },
            },
          },
        ],
      },
      Object {
        "bounds": Object {
          "height": 1004,
          "width": 731,
          "x": 1707,
          "y": 1981,
        },
        "corners": Array [
          Object {
            "x": 1707,
            "y": 1983,
          },
          Object {
            "x": 2436,
            "y": 1981,
          },
          Object {
            "x": 1711,
            "y": 2984,
          },
          Object {
            "x": 2437,
            "y": 2980,
          },
        ],
        "options": Array [
          Object {
            "bounds": Object {
              "height": 151,
              "width": 731,
              "x": 1707,
              "y": 2343,
            },
            "target": Object {
              "bounds": Object {
                "height": 42,
                "width": 63,
                "x": 1754,
                "y": 2348,
              },
              "inner": Object {
                "height": 28,
                "width": 49,
                "x": 1761,
                "y": 2355,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 148,
              "width": 731,
              "x": 1707,
              "y": 2495,
            },
            "target": Object {
              "bounds": Object {
                "height": 41,
                "width": 64,
                "x": 1754,
                "y": 2499,
              },
              "inner": Object {
                "height": 28,
                "width": 50,
                "x": 1761,
                "y": 2506,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 149,
              "width": 731,
              "x": 1707,
              "y": 2643,
            },
            "target": Object {
              "bounds": Object {
                "height": 42,
                "width": 63,
                "x": 1755,
                "y": 2647,
              },
              "inner": Object {
                "height": 29,
                "width": 49,
                "x": 1762,
                "y": 2653,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 96,
              "width": 731,
              "x": 1707,
              "y": 2793,
            },
            "target": Object {
              "bounds": Object {
                "height": 42,
                "width": 64,
                "x": 1755,
                "y": 2796,
              },
              "inner": Object {
                "height": 28,
                "width": 50,
                "x": 1762,
                "y": 2803,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 93,
              "width": 731,
              "x": 1707,
              "y": 2889,
            },
            "target": Object {
              "bounds": Object {
                "height": 42,
                "width": 63,
                "x": 1756,
                "y": 2892,
              },
              "inner": Object {
                "height": 28,
                "width": 49,
                "x": 1763,
                "y": 2899,
              },
            },
          },
        ],
      },
    ]
  `)
})

test('missing templates', async () => {
  const interpreter = new Interpreter(election)
  const metadataPage1 = await templatePage1.metadata()
  const metadataPage2 = await templatePage2.metadata()

  expect(interpreter.hasMissingTemplates()).toBe(true)
  expect([...interpreter.getMissingTemplates()]).toEqual([
    {
      ballotStyleId: metadataPage1.ballotStyleId,
      isTestBallot: false,
      pageCount: -1,
      pageNumber: -1,
      precinctId: metadataPage1.precinctId,
    },
  ])

  await interpreter.addTemplate(await templatePage1.imageData())
  expect(interpreter.hasMissingTemplates()).toBe(true)
  expect([...interpreter.getMissingTemplates()]).toEqual([
    {
      ballotStyleId: metadataPage2.ballotStyleId,
      isTestBallot: true,
      pageCount: 2,
      pageNumber: 2,
      precinctId: metadataPage2.precinctId,
    },
  ])

  await interpreter.addTemplate(await templatePage2.imageData())
  expect(interpreter.hasMissingTemplates()).toBe(false)
  expect([...interpreter.getMissingTemplates()]).toEqual([])
})

test('interpret empty ballot', async () => {
  const interpreter = new Interpreter(election)

  await expect(
    interpreter.interpretBallot(await templatePage1.imageData())
  ).rejects.toThrow(
    'Refusing to interpret ballots before all templates are added.'
  )
  const p1 = await interpreter.addTemplate(await templatePage1.imageData())
  await interpreter.addTemplate(await templatePage2.imageData())

  const {
    matchedTemplate,
    metadata,
    ballot,
  } = await interpreter.interpretBallot(await templatePage1.imageData())
  expect(matchedTemplate === p1).toBe(true)
  expect(metadata.ballotStyleId).toEqual(p1.ballotImage.metadata.ballotStyleId)
  expect(ballot.votes).toEqual({})
})

test('interpret single vote', async () => {
  const interpreter = new Interpreter(election)

  await interpreter.addTemplate(await templatePage1.imageData())
  await interpreter.addTemplate(await templatePage2.imageData())

  const { ballot } = await interpreter.interpretBallot(
    await yvonneDavis.imageData()
  )
  expect(ballot.votes).toMatchInlineSnapshot(`
    Object {
      "texas-house-district-111": Array [
        Object {
          "id": "yvonne-davis",
          "incumbent": true,
          "name": "Yvonne Davis",
          "partyId": "2",
        },
      ],
    }
  `)
})

test('interpret multiple vote', async () => {
  const interpreter = new Interpreter(election)

  await interpreter.addTemplate(await templatePage1.imageData())
  await interpreter.addTemplate(await templatePage2.imageData())

  const { ballot, marks } = await interpreter.interpretBallot(
    await fullVotesPage1.imageData()
  )
  expect(ballot.votes).toMatchInlineSnapshot(`
    Object {
      "dallas-county-commissioners-court-pct-3": Array [
        Object {
          "id": "andrew-jewell",
          "name": "Andrew Jewell",
          "partyId": "7",
        },
      ],
      "dallas-county-sheriff": Array [
        Object {
          "id": "chad-prda",
          "name": "Chad Prda",
          "partyId": "3",
        },
      ],
      "dallas-county-tax-assessor": Array [
        Object {
          "id": "john-ames",
          "incumbent": true,
          "name": "John Ames",
          "partyId": "2",
        },
      ],
      "texas-house-district-111": Array [
        Object {
          "id": "__write-in",
          "isWriteIn": true,
          "name": "Write-In",
        },
      ],
      "texas-sc-judge-place-6": Array [
        Object {
          "id": "jane-bland",
          "incumbent": true,
          "name": "Jane Bland",
          "partyId": "3",
        },
      ],
      "us-house-district-30": Array [
        Object {
          "id": "eddie-bernice-johnson",
          "incumbent": true,
          "name": "Eddie Bernice Johnson",
          "partyId": "2",
        },
      ],
      "us-senate": Array [
        Object {
          "id": "tim-smith",
          "name": "Tim Smith",
          "partyId": "6",
        },
      ],
    }
  `)

  expect(
    marks.map((mark) =>
      mark.type === 'yesno'
        ? { type: mark.type, option: mark.option, score: mark.score }
        : mark.type === 'candidate'
        ? { type: mark.type, option: mark.option.name, score: mark.score }
        : { type: mark.type, bounds: mark.bounds }
    )
  ).toMatchInlineSnapshot(`
    Array [
      Object {
        "option": "John Cornyn",
        "score": 0,
        "type": "candidate",
      },
      Object {
        "option": "James Brumley",
        "score": 0,
        "type": "candidate",
      },
      Object {
        "option": "Cedric Jefferson",
        "score": 0,
        "type": "candidate",
      },
      Object {
        "option": "Tim Smith",
        "score": 0.9328287606433302,
        "type": "candidate",
      },
      Object {
        "option": "Arjun Srinivasan",
        "score": 0,
        "type": "candidate",
      },
      Object {
        "option": "Ricardo Turullols-Bonilla",
        "score": 0,
        "type": "candidate",
      },
      Object {
        "option": "Eddie Bernice Johnson",
        "score": 0.8958930276981852,
        "type": "candidate",
      },
      Object {
        "option": "Tre Pennie",
        "score": 0,
        "type": "candidate",
      },
      Object {
        "option": "Jane Bland",
        "score": 0.4854732895970009,
        "type": "candidate",
      },
      Object {
        "option": "Kathy Cheng",
        "score": 0,
        "type": "candidate",
      },
      Object {
        "option": "Yvonne Davis",
        "score": 0,
        "type": "candidate",
      },
      Object {
        "option": "Write-In",
        "score": 0.8395061728395061,
        "type": "candidate",
      },
      Object {
        "option": "John Ames",
        "score": 0.8551136363636364,
        "type": "candidate",
      },
      Object {
        "option": "Write-In",
        "score": 0,
        "type": "candidate",
      },
      Object {
        "option": "Marian Brown",
        "score": 0,
        "type": "candidate",
      },
      Object {
        "option": "Chad Prda",
        "score": 0.6976303317535545,
        "type": "candidate",
      },
      Object {
        "option": "Write-In",
        "score": 0,
        "type": "candidate",
      },
      Object {
        "option": "John Wiley Price",
        "score": 0,
        "type": "candidate",
      },
      Object {
        "option": "S.T. Russell",
        "score": 0,
        "type": "candidate",
      },
      Object {
        "option": "Andrew Jewell",
        "score": 0.776930409914204,
        "type": "candidate",
      },
      Object {
        "option": "Write-In",
        "score": 0,
        "type": "candidate",
      },
      Object {
        "option": "Write-In",
        "score": 0,
        "type": "candidate",
      },
    ]
  `)
})

test('invalid marks', async () => {
  const interpreter = new Interpreter(election)

  await interpreter.addTemplate(
    await templatePage1.imageData(),
    await templatePage1.metadata()
  )
  await interpreter.addTemplate(
    await templatePage2.imageData(),
    await templatePage2.metadata()
  )

  const { ballot, marks } = await interpreter.interpretBallot(
    await fullVotesPage2.imageData()
  )
  expect(ballot.votes).toMatchInlineSnapshot(`
    Object {
      "dallas-city-council": Array [
        Object {
          "id": "randall-rupp",
          "name": "Randall Rupp",
          "partyId": "2",
        },
        Object {
          "id": "__write-in",
          "isWriteIn": true,
          "name": "Write-In",
        },
      ],
      "dallas-county-proposition-r": "yes",
      "dallas-county-retain-chief-justice": "yes",
    }
  `)

  expect(marks).toMatchInlineSnapshot(`
    Array [
      Object {
        "bounds": Object {
          "height": 43,
          "width": 62,
          "x": 215,
          "y": 636,
        },
        "contest": Object {
          "description": "Shall Robert Demergue be retained as Chief Justice of the Dallas County Court of Appeals?",
          "districtId": "12",
          "id": "dallas-county-retain-chief-justice",
          "section": "Dallas County",
          "title": "Retain Robert Demergue as Chief Justice?",
          "type": "yesno",
        },
        "option": "yes",
        "score": 0.3758325404376784,
        "target": Object {
          "bounds": Object {
            "height": 43,
            "width": 62,
            "x": 215,
            "y": 636,
          },
          "inner": Object {
            "height": 29,
            "width": 48,
            "x": 222,
            "y": 643,
          },
        },
        "type": "yesno",
      },
      Object {
        "bounds": Object {
          "height": 43,
          "width": 63,
          "x": 214,
          "y": 733,
        },
        "contest": Object {
          "description": "Shall Robert Demergue be retained as Chief Justice of the Dallas County Court of Appeals?",
          "districtId": "12",
          "id": "dallas-county-retain-chief-justice",
          "section": "Dallas County",
          "title": "Retain Robert Demergue as Chief Justice?",
          "type": "yesno",
        },
        "option": "yes",
        "score": 0,
        "target": Object {
          "bounds": Object {
            "height": 43,
            "width": 63,
            "x": 214,
            "y": 733,
          },
          "inner": Object {
            "height": 29,
            "width": 48,
            "x": 222,
            "y": 740,
          },
        },
        "type": "yesno",
      },
      Object {
        "bounds": Object {
          "height": 42,
          "width": 62,
          "x": 214,
          "y": 1323,
        },
        "contest": Object {
          "description": "Shall the Dallas County extend the Recycling Program countywide?",
          "districtId": "12",
          "id": "dallas-county-proposition-r",
          "section": "Dallas County",
          "title": "Proposition R: Countywide Recycling Program",
          "type": "yesno",
        },
        "option": "yes",
        "score": 0.937381404174573,
        "target": Object {
          "bounds": Object {
            "height": 42,
            "width": 62,
            "x": 214,
            "y": 1323,
          },
          "inner": Object {
            "height": 28,
            "width": 48,
            "x": 221,
            "y": 1330,
          },
        },
        "type": "yesno",
      },
      Object {
        "bounds": Object {
          "height": 43,
          "width": 62,
          "x": 214,
          "y": 1419,
        },
        "contest": Object {
          "description": "Shall the Dallas County extend the Recycling Program countywide?",
          "districtId": "12",
          "id": "dallas-county-proposition-r",
          "section": "Dallas County",
          "title": "Proposition R: Countywide Recycling Program",
          "type": "yesno",
        },
        "option": "yes",
        "score": 0,
        "target": Object {
          "bounds": Object {
            "height": 43,
            "width": 62,
            "x": 214,
            "y": 1419,
          },
          "inner": Object {
            "height": 28,
            "width": 48,
            "x": 221,
            "y": 1427,
          },
        },
        "type": "yesno",
      },
      Object {
        "bounds": Object {
          "height": 43,
          "width": 63,
          "x": 982,
          "y": 371,
        },
        "contest": Object {
          "allowWriteIns": true,
          "candidates": Array [
            Object {
              "id": "harvey-eagle",
              "name": "Harvey Eagle",
              "partyId": "2",
            },
            Object {
              "id": "randall-rupp",
              "name": "Randall Rupp",
              "partyId": "2",
            },
            Object {
              "id": "carroll-shry",
              "name": "Carroll Shry",
              "partyId": "2",
            },
            Object {
              "id": "beverly-barker",
              "name": "Beverly Barker",
              "partyId": "3",
            },
            Object {
              "id": "donald-davis",
              "name": "Donald Davis",
              "partyId": "3",
            },
            Object {
              "id": "hugo-smith",
              "name": "Hugo Smith",
              "partyId": "3",
            },
          ],
          "districtId": "12",
          "id": "dallas-city-council",
          "seats": 3,
          "section": "City of Dallas",
          "title": "City Council",
          "type": "candidate",
        },
        "option": Object {
          "id": "harvey-eagle",
          "name": "Harvey Eagle",
          "partyId": "2",
        },
        "score": 0,
        "target": Object {
          "bounds": Object {
            "height": 43,
            "width": 63,
            "x": 982,
            "y": 371,
          },
          "inner": Object {
            "height": 28,
            "width": 49,
            "x": 989,
            "y": 378,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 42,
          "width": 63,
          "x": 982,
          "y": 522,
        },
        "contest": Object {
          "allowWriteIns": true,
          "candidates": Array [
            Object {
              "id": "harvey-eagle",
              "name": "Harvey Eagle",
              "partyId": "2",
            },
            Object {
              "id": "randall-rupp",
              "name": "Randall Rupp",
              "partyId": "2",
            },
            Object {
              "id": "carroll-shry",
              "name": "Carroll Shry",
              "partyId": "2",
            },
            Object {
              "id": "beverly-barker",
              "name": "Beverly Barker",
              "partyId": "3",
            },
            Object {
              "id": "donald-davis",
              "name": "Donald Davis",
              "partyId": "3",
            },
            Object {
              "id": "hugo-smith",
              "name": "Hugo Smith",
              "partyId": "3",
            },
          ],
          "districtId": "12",
          "id": "dallas-city-council",
          "seats": 3,
          "section": "City of Dallas",
          "title": "City Council",
          "type": "candidate",
        },
        "option": Object {
          "id": "randall-rupp",
          "name": "Randall Rupp",
          "partyId": "2",
        },
        "score": 0.8097514340344169,
        "target": Object {
          "bounds": Object {
            "height": 42,
            "width": 63,
            "x": 982,
            "y": 522,
          },
          "inner": Object {
            "height": 28,
            "width": 48,
            "x": 990,
            "y": 529,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 42,
          "width": 63,
          "x": 982,
          "y": 672,
        },
        "contest": Object {
          "allowWriteIns": true,
          "candidates": Array [
            Object {
              "id": "harvey-eagle",
              "name": "Harvey Eagle",
              "partyId": "2",
            },
            Object {
              "id": "randall-rupp",
              "name": "Randall Rupp",
              "partyId": "2",
            },
            Object {
              "id": "carroll-shry",
              "name": "Carroll Shry",
              "partyId": "2",
            },
            Object {
              "id": "beverly-barker",
              "name": "Beverly Barker",
              "partyId": "3",
            },
            Object {
              "id": "donald-davis",
              "name": "Donald Davis",
              "partyId": "3",
            },
            Object {
              "id": "hugo-smith",
              "name": "Hugo Smith",
              "partyId": "3",
            },
          ],
          "districtId": "12",
          "id": "dallas-city-council",
          "seats": 3,
          "section": "City of Dallas",
          "title": "City Council",
          "type": "candidate",
        },
        "option": Object {
          "id": "carroll-shry",
          "name": "Carroll Shry",
          "partyId": "2",
        },
        "score": 0,
        "target": Object {
          "bounds": Object {
            "height": 42,
            "width": 63,
            "x": 982,
            "y": 672,
          },
          "inner": Object {
            "height": 28,
            "width": 48,
            "x": 990,
            "y": 679,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 42,
          "width": 63,
          "x": 982,
          "y": 824,
        },
        "contest": Object {
          "allowWriteIns": true,
          "candidates": Array [
            Object {
              "id": "harvey-eagle",
              "name": "Harvey Eagle",
              "partyId": "2",
            },
            Object {
              "id": "randall-rupp",
              "name": "Randall Rupp",
              "partyId": "2",
            },
            Object {
              "id": "carroll-shry",
              "name": "Carroll Shry",
              "partyId": "2",
            },
            Object {
              "id": "beverly-barker",
              "name": "Beverly Barker",
              "partyId": "3",
            },
            Object {
              "id": "donald-davis",
              "name": "Donald Davis",
              "partyId": "3",
            },
            Object {
              "id": "hugo-smith",
              "name": "Hugo Smith",
              "partyId": "3",
            },
          ],
          "districtId": "12",
          "id": "dallas-city-council",
          "seats": 3,
          "section": "City of Dallas",
          "title": "City Council",
          "type": "candidate",
        },
        "option": Object {
          "id": "beverly-barker",
          "name": "Beverly Barker",
          "partyId": "3",
        },
        "score": 0.17273576097105509,
        "target": Object {
          "bounds": Object {
            "height": 42,
            "width": 63,
            "x": 982,
            "y": 824,
          },
          "inner": Object {
            "height": 28,
            "width": 49,
            "x": 989,
            "y": 831,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 43,
          "width": 63,
          "x": 982,
          "y": 974,
        },
        "contest": Object {
          "allowWriteIns": true,
          "candidates": Array [
            Object {
              "id": "harvey-eagle",
              "name": "Harvey Eagle",
              "partyId": "2",
            },
            Object {
              "id": "randall-rupp",
              "name": "Randall Rupp",
              "partyId": "2",
            },
            Object {
              "id": "carroll-shry",
              "name": "Carroll Shry",
              "partyId": "2",
            },
            Object {
              "id": "beverly-barker",
              "name": "Beverly Barker",
              "partyId": "3",
            },
            Object {
              "id": "donald-davis",
              "name": "Donald Davis",
              "partyId": "3",
            },
            Object {
              "id": "hugo-smith",
              "name": "Hugo Smith",
              "partyId": "3",
            },
          ],
          "districtId": "12",
          "id": "dallas-city-council",
          "seats": 3,
          "section": "City of Dallas",
          "title": "City Council",
          "type": "candidate",
        },
        "option": Object {
          "id": "donald-davis",
          "name": "Donald Davis",
          "partyId": "3",
        },
        "score": 0,
        "target": Object {
          "bounds": Object {
            "height": 43,
            "width": 63,
            "x": 982,
            "y": 974,
          },
          "inner": Object {
            "height": 28,
            "width": 49,
            "x": 989,
            "y": 981,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 42,
          "width": 63,
          "x": 982,
          "y": 1125,
        },
        "contest": Object {
          "allowWriteIns": true,
          "candidates": Array [
            Object {
              "id": "harvey-eagle",
              "name": "Harvey Eagle",
              "partyId": "2",
            },
            Object {
              "id": "randall-rupp",
              "name": "Randall Rupp",
              "partyId": "2",
            },
            Object {
              "id": "carroll-shry",
              "name": "Carroll Shry",
              "partyId": "2",
            },
            Object {
              "id": "beverly-barker",
              "name": "Beverly Barker",
              "partyId": "3",
            },
            Object {
              "id": "donald-davis",
              "name": "Donald Davis",
              "partyId": "3",
            },
            Object {
              "id": "hugo-smith",
              "name": "Hugo Smith",
              "partyId": "3",
            },
          ],
          "districtId": "12",
          "id": "dallas-city-council",
          "seats": 3,
          "section": "City of Dallas",
          "title": "City Council",
          "type": "candidate",
        },
        "option": Object {
          "id": "hugo-smith",
          "name": "Hugo Smith",
          "partyId": "3",
        },
        "score": 0,
        "target": Object {
          "bounds": Object {
            "height": 42,
            "width": 63,
            "x": 982,
            "y": 1125,
          },
          "inner": Object {
            "height": 28,
            "width": 49,
            "x": 989,
            "y": 1132,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 42,
          "width": 63,
          "x": 982,
          "y": 1276,
        },
        "contest": Object {
          "allowWriteIns": true,
          "candidates": Array [
            Object {
              "id": "harvey-eagle",
              "name": "Harvey Eagle",
              "partyId": "2",
            },
            Object {
              "id": "randall-rupp",
              "name": "Randall Rupp",
              "partyId": "2",
            },
            Object {
              "id": "carroll-shry",
              "name": "Carroll Shry",
              "partyId": "2",
            },
            Object {
              "id": "beverly-barker",
              "name": "Beverly Barker",
              "partyId": "3",
            },
            Object {
              "id": "donald-davis",
              "name": "Donald Davis",
              "partyId": "3",
            },
            Object {
              "id": "hugo-smith",
              "name": "Hugo Smith",
              "partyId": "3",
            },
          ],
          "districtId": "12",
          "id": "dallas-city-council",
          "seats": 3,
          "section": "City of Dallas",
          "title": "City Council",
          "type": "candidate",
        },
        "option": Object {
          "id": "__write-in",
          "isWriteIn": true,
          "name": "Write-In",
        },
        "score": 0,
        "target": Object {
          "bounds": Object {
            "height": 42,
            "width": 63,
            "x": 982,
            "y": 1276,
          },
          "inner": Object {
            "height": 29,
            "width": 49,
            "x": 989,
            "y": 1282,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 42,
          "width": 63,
          "x": 982,
          "y": 1373,
        },
        "contest": Object {
          "allowWriteIns": true,
          "candidates": Array [
            Object {
              "id": "harvey-eagle",
              "name": "Harvey Eagle",
              "partyId": "2",
            },
            Object {
              "id": "randall-rupp",
              "name": "Randall Rupp",
              "partyId": "2",
            },
            Object {
              "id": "carroll-shry",
              "name": "Carroll Shry",
              "partyId": "2",
            },
            Object {
              "id": "beverly-barker",
              "name": "Beverly Barker",
              "partyId": "3",
            },
            Object {
              "id": "donald-davis",
              "name": "Donald Davis",
              "partyId": "3",
            },
            Object {
              "id": "hugo-smith",
              "name": "Hugo Smith",
              "partyId": "3",
            },
          ],
          "districtId": "12",
          "id": "dallas-city-council",
          "seats": 3,
          "section": "City of Dallas",
          "title": "City Council",
          "type": "candidate",
        },
        "option": Object {
          "id": "__write-in",
          "isWriteIn": true,
          "name": "Write-In",
        },
        "score": 0.9441287878787878,
        "target": Object {
          "bounds": Object {
            "height": 42,
            "width": 63,
            "x": 982,
            "y": 1373,
          },
          "inner": Object {
            "height": 28,
            "width": 49,
            "x": 989,
            "y": 1380,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 43,
          "width": 63,
          "x": 982,
          "y": 1469,
        },
        "contest": Object {
          "allowWriteIns": true,
          "candidates": Array [
            Object {
              "id": "harvey-eagle",
              "name": "Harvey Eagle",
              "partyId": "2",
            },
            Object {
              "id": "randall-rupp",
              "name": "Randall Rupp",
              "partyId": "2",
            },
            Object {
              "id": "carroll-shry",
              "name": "Carroll Shry",
              "partyId": "2",
            },
            Object {
              "id": "beverly-barker",
              "name": "Beverly Barker",
              "partyId": "3",
            },
            Object {
              "id": "donald-davis",
              "name": "Donald Davis",
              "partyId": "3",
            },
            Object {
              "id": "hugo-smith",
              "name": "Hugo Smith",
              "partyId": "3",
            },
          ],
          "districtId": "12",
          "id": "dallas-city-council",
          "seats": 3,
          "section": "City of Dallas",
          "title": "City Council",
          "type": "candidate",
        },
        "option": Object {
          "id": "__write-in",
          "isWriteIn": true,
          "name": "Write-In",
        },
        "score": 0,
        "target": Object {
          "bounds": Object {
            "height": 43,
            "width": 63,
            "x": 982,
            "y": 1469,
          },
          "inner": Object {
            "height": 29,
            "width": 49,
            "x": 989,
            "y": 1476,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 42,
          "width": 63,
          "x": 1752,
          "y": 374,
        },
        "contest": Object {
          "allowWriteIns": true,
          "candidates": Array [
            Object {
              "id": "orville-white",
              "name": "Orville White",
              "partyId": "2",
            },
            Object {
              "id": "gregory-seldon",
              "name": "Gregory Seldon",
              "partyId": "3",
            },
          ],
          "districtId": "12",
          "id": "dallas-mayor",
          "seats": 1,
          "section": "City of Dallas",
          "title": "Mayor",
          "type": "candidate",
        },
        "option": Object {
          "id": "orville-white",
          "name": "Orville White",
          "partyId": "2",
        },
        "score": 0,
        "target": Object {
          "bounds": Object {
            "height": 42,
            "width": 63,
            "x": 1752,
            "y": 374,
          },
          "inner": Object {
            "height": 28,
            "width": 49,
            "x": 1759,
            "y": 381,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 42,
          "width": 63,
          "x": 1752,
          "y": 524,
        },
        "contest": Object {
          "allowWriteIns": true,
          "candidates": Array [
            Object {
              "id": "orville-white",
              "name": "Orville White",
              "partyId": "2",
            },
            Object {
              "id": "gregory-seldon",
              "name": "Gregory Seldon",
              "partyId": "3",
            },
          ],
          "districtId": "12",
          "id": "dallas-mayor",
          "seats": 1,
          "section": "City of Dallas",
          "title": "Mayor",
          "type": "candidate",
        },
        "option": Object {
          "id": "gregory-seldon",
          "name": "Gregory Seldon",
          "partyId": "3",
        },
        "score": 0,
        "target": Object {
          "bounds": Object {
            "height": 42,
            "width": 63,
            "x": 1752,
            "y": 524,
          },
          "inner": Object {
            "height": 28,
            "width": 50,
            "x": 1758,
            "y": 531,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 42,
          "width": 64,
          "x": 1751,
          "y": 674,
        },
        "contest": Object {
          "allowWriteIns": true,
          "candidates": Array [
            Object {
              "id": "orville-white",
              "name": "Orville White",
              "partyId": "2",
            },
            Object {
              "id": "gregory-seldon",
              "name": "Gregory Seldon",
              "partyId": "3",
            },
          ],
          "districtId": "12",
          "id": "dallas-mayor",
          "seats": 1,
          "section": "City of Dallas",
          "title": "Mayor",
          "type": "candidate",
        },
        "option": Object {
          "id": "__write-in",
          "isWriteIn": true,
          "name": "Write-In",
        },
        "score": 0,
        "target": Object {
          "bounds": Object {
            "height": 42,
            "width": 64,
            "x": 1751,
            "y": 674,
          },
          "inner": Object {
            "height": 29,
            "width": 50,
            "x": 1758,
            "y": 680,
          },
        },
        "type": "candidate",
      },
    ]
  `)
})

test('custom QR code reader', async () => {
  const interpreter = new Interpreter({
    election,
    detectQRCode: async (): Promise<DetectQRCodeResult> => ({
      data: Buffer.from('https://vx.vote?t=t&pr=11&bs=22&p=3-4'),
    }),
  })
  const template = await interpreter.interpretTemplate(
    await templatePage1.imageData()
  )

  expect(template.ballotImage.metadata).toEqual({
    ballotStyleId: '22',
    precinctId: '11',
    isTestBallot: true,
    pageNumber: 3,
    pageCount: 4,
  })
})

test('upside-down ballot', async () => {
  const interpreter = new Interpreter(election)

  await interpreter.addTemplate(
    await templatePage1.imageData(),
    await templatePage1.metadata()
  )
  await interpreter.addTemplate(
    await templatePage2.imageData(),
    await templatePage2.metadata()
  )

  const imageData = await yvonneDavis.imageData()
  flipVH(imageData)

  const { ballot } = await interpreter.interpretBallot(imageData)
  expect(ballot.votes).toMatchInlineSnapshot(`
    Object {
      "texas-house-district-111": Array [
        Object {
          "id": "yvonne-davis",
          "incumbent": true,
          "name": "Yvonne Davis",
          "partyId": "2",
        },
      ],
    }
  `)
})
