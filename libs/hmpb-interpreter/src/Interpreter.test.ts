import {
  fullVotesPage1,
  fullVotesPage2,
  templatePage1,
  templatePage2,
  yvonneDavis,
} from '../test/fixtures'
import election from '../test/fixtures/election'
import Interpreter from './Interpreter'
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

  expect(template.ballotImage.imageData).toBe(imageData)
  expect(template.contests).toMatchInlineSnapshot(`
    Array [
      Object {
        "bounds": Object {
          "height": 1142,
          "width": 729,
          "x": 935,
          "y": 127,
        },
        "options": Array [
          Object {
            "bounds": Object {
              "height": 152,
              "width": 729,
              "x": 935,
              "y": 365,
            },
            "target": Object {
              "height": 43,
              "width": 63,
              "x": 981,
              "y": 370,
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
              "height": 42,
              "width": 63,
              "x": 981,
              "y": 522,
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
              "height": 42,
              "width": 63,
              "x": 981,
              "y": 672,
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
              "height": 42,
              "width": 63,
              "x": 981,
              "y": 822,
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
              "height": 43,
              "width": 63,
              "x": 982,
              "y": 973,
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
              "height": 42,
              "width": 63,
              "x": 982,
              "y": 1124,
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
        "options": Array [
          Object {
            "bounds": Object {
              "height": 151,
              "width": 728,
              "x": 937,
              "y": 1611,
            },
            "target": Object {
              "height": 43,
              "width": 63,
              "x": 983,
              "y": 1616,
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
              "height": 42,
              "width": 63,
              "x": 983,
              "y": 1767,
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
        "options": Array [
          Object {
            "bounds": Object {
              "height": 151,
              "width": 729,
              "x": 938,
              "y": 2254,
            },
            "target": Object {
              "height": 43,
              "width": 62,
              "x": 985,
              "y": 2259,
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
              "height": 42,
              "width": 63,
              "x": 985,
              "y": 2410,
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
        "options": Array [
          Object {
            "bounds": Object {
              "height": 151,
              "width": 729,
              "x": 1704,
              "y": 429,
            },
            "target": Object {
              "height": 43,
              "width": 63,
              "x": 1750,
              "y": 434,
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
              "height": 42,
              "width": 63,
              "x": 1750,
              "y": 585,
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
        "options": Array [
          Object {
            "bounds": Object {
              "height": 150,
              "width": 729,
              "x": 1704,
              "y": 1016,
            },
            "target": Object {
              "height": 43,
              "width": 64,
              "x": 1750,
              "y": 1021,
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
              "height": 42,
              "width": 63,
              "x": 1751,
              "y": 1171,
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
        "options": Array [
          Object {
            "bounds": Object {
              "height": 150,
              "width": 731,
              "x": 1705,
              "y": 1544,
            },
            "target": Object {
              "height": 42,
              "width": 63,
              "x": 1752,
              "y": 1549,
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
              "height": 42,
              "width": 63,
              "x": 1752,
              "y": 1699,
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
              "height": 43,
              "width": 63,
              "x": 1753,
              "y": 1849,
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
        "options": Array [
          Object {
            "bounds": Object {
              "height": 151,
              "width": 731,
              "x": 1707,
              "y": 2343,
            },
            "target": Object {
              "height": 42,
              "width": 63,
              "x": 1754,
              "y": 2348,
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
              "height": 41,
              "width": 64,
              "x": 1754,
              "y": 2499,
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
              "height": 42,
              "width": 63,
              "x": 1755,
              "y": 2647,
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
              "height": 42,
              "width": 64,
              "x": 1755,
              "y": 2796,
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
              "height": 42,
              "width": 63,
              "x": 1756,
              "y": 2892,
            },
          },
        ],
      },
    ]
  `)
})

test('missing templates', async () => {
  const interpreter = new Interpreter(election)
  expect(interpreter.hasMissingTemplates()).toBe(true)

  await interpreter.addTemplate(await templatePage1.imageData())
  expect(interpreter.hasMissingTemplates()).toBe(true)

  await interpreter.addTemplate(await templatePage2.imageData())
  expect(interpreter.hasMissingTemplates()).toBe(false)
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

  const { matchedTemplate, ballot } = await interpreter.interpretBallot(
    await templatePage1.imageData()
  )
  expect(matchedTemplate === p1).toBe(true)
  expect(ballot.ballotStyle).toEqual(
    expect.objectContaining({ id: p1.ballotImage.metadata.ballotStyleId })
  )
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
        "score": 0.045773348098929495,
        "type": "candidate",
      },
      Object {
        "option": "James Brumley",
        "score": 0.01473922902494331,
        "type": "candidate",
      },
      Object {
        "option": "Cedric Jefferson",
        "score": 0.03136810279667423,
        "type": "candidate",
      },
      Object {
        "option": "Tim Smith",
        "score": 0.46485260770975056,
        "type": "candidate",
      },
      Object {
        "option": "Arjun Srinivasan",
        "score": 0.05020302694721299,
        "type": "candidate",
      },
      Object {
        "option": "Ricardo Turullols-Bonilla",
        "score": 0.015873015873015872,
        "type": "candidate",
      },
      Object {
        "option": "Eddie Bernice Johnson",
        "score": 0.4130675526024363,
        "type": "candidate",
      },
      Object {
        "option": "Tre Pennie",
        "score": 0.02343159486016629,
        "type": "candidate",
      },
      Object {
        "option": "Jane Bland",
        "score": 0.33758439609902474,
        "type": "candidate",
      },
      Object {
        "option": "Kathy Cheng",
        "score": 0.03854875283446712,
        "type": "candidate",
      },
      Object {
        "option": "Yvonne Davis",
        "score": 0.060538944259874494,
        "type": "candidate",
      },
      Object {
        "option": "Write-In",
        "score": 0.45351473922902497,
        "type": "candidate",
      },
      Object {
        "option": "John Ames",
        "score": 0.42005813953488375,
        "type": "candidate",
      },
      Object {
        "option": "Write-In",
        "score": 0.0200302343159486,
        "type": "candidate",
      },
      Object {
        "option": "Marian Brown",
        "score": 0.08692365835222977,
        "type": "candidate",
      },
      Object {
        "option": "Chad Prda",
        "score": 0.390400604686319,
        "type": "candidate",
      },
      Object {
        "option": "Write-In",
        "score": 0.03322259136212625,
        "type": "candidate",
      },
      Object {
        "option": "John Wiley Price",
        "score": 0.02040816326530612,
        "type": "candidate",
      },
      Object {
        "option": "S.T. Russell",
        "score": 0.039634146341463415,
        "type": "candidate",
      },
      Object {
        "option": "Andrew Jewell",
        "score": 0.41496598639455784,
        "type": "candidate",
      },
      Object {
        "option": "Write-In",
        "score": 0.033854166666666664,
        "type": "candidate",
      },
      Object {
        "option": "Write-In",
        "score": 0.02758881330309902,
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

  const { ballot } = await interpreter.interpretBallot(
    await fullVotesPage2.imageData()
  )
  // TODO: communicate invalid marks somehow instead of just ignoring them
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
    }
  `)
})

test('custom QR code reader', async () => {
  const interpreter = new Interpreter({
    election,
    decodeQRCode: async (): Promise<Buffer> =>
      Buffer.from('https://vx.vote?t=t&pr=11&bs=22&p=3-4'),
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
