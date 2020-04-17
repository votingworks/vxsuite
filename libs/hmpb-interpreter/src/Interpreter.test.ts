import {
  templatePage1,
  templatePage2,
  yvonneDavis,
  fullVotesPage1,
  fullVotesPage2,
} from '../test/fixtures'
import election from '../test/fixtures/election'
import Interpreter from './Interpreter'

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
        "targets": Array [
          Object {
            "height": 43,
            "width": 63,
            "x": 981,
            "y": 370,
          },
          Object {
            "height": 42,
            "width": 63,
            "x": 981,
            "y": 522,
          },
          Object {
            "height": 42,
            "width": 63,
            "x": 981,
            "y": 672,
          },
          Object {
            "height": 42,
            "width": 63,
            "x": 981,
            "y": 822,
          },
          Object {
            "height": 43,
            "width": 63,
            "x": 982,
            "y": 973,
          },
          Object {
            "height": 42,
            "width": 63,
            "x": 982,
            "y": 1124,
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
        "targets": Array [
          Object {
            "height": 43,
            "width": 63,
            "x": 983,
            "y": 1616,
          },
          Object {
            "height": 42,
            "width": 63,
            "x": 983,
            "y": 1767,
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
        "targets": Array [
          Object {
            "height": 43,
            "width": 62,
            "x": 985,
            "y": 2259,
          },
          Object {
            "height": 42,
            "width": 63,
            "x": 985,
            "y": 2410,
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
        "targets": Array [
          Object {
            "height": 43,
            "width": 63,
            "x": 1750,
            "y": 434,
          },
          Object {
            "height": 42,
            "width": 63,
            "x": 1750,
            "y": 585,
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
        "targets": Array [
          Object {
            "height": 43,
            "width": 64,
            "x": 1750,
            "y": 1021,
          },
          Object {
            "height": 42,
            "width": 63,
            "x": 1751,
            "y": 1171,
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
        "targets": Array [
          Object {
            "height": 42,
            "width": 63,
            "x": 1752,
            "y": 1549,
          },
          Object {
            "height": 42,
            "width": 63,
            "x": 1752,
            "y": 1699,
          },
          Object {
            "height": 43,
            "width": 63,
            "x": 1753,
            "y": 1849,
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
        "targets": Array [
          Object {
            "height": 42,
            "width": 63,
            "x": 1754,
            "y": 2348,
          },
          Object {
            "height": 41,
            "width": 64,
            "x": 1754,
            "y": 2499,
          },
          Object {
            "height": 42,
            "width": 63,
            "x": 1755,
            "y": 2647,
          },
          Object {
            "height": 42,
            "width": 64,
            "x": 1755,
            "y": 2796,
          },
          Object {
            "height": 42,
            "width": 63,
            "x": 1756,
            "y": 2892,
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
  expect(ballot.votes).toEqual({
    '4': [
      expect.objectContaining({
        id: '41',
        name: 'Yvonne Davis',
      }),
    ],
  })
})

test('interpret multiple vote', async () => {
  const interpreter = new Interpreter(election)

  await interpreter.addTemplate(await templatePage1.imageData())
  await interpreter.addTemplate(await templatePage2.imageData())

  const { ballot } = await interpreter.interpretBallot(
    await fullVotesPage1.imageData()
  )
  expect(ballot.votes).toMatchInlineSnapshot(`
    Object {
      "1": Array [
        Object {
          "id": "14",
          "name": "Tim Smith",
          "partyId": "6",
        },
      ],
      "2": Array [
        Object {
          "id": "21",
          "incumbent": true,
          "name": "Eddie Bernice Johnson",
          "partyId": "2",
        },
      ],
      "3": Array [
        Object {
          "id": "31",
          "incumbent": true,
          "name": "Jane Bland",
          "partyId": "3",
        },
      ],
      "4": Array [
        Object {
          "id": "__write-in",
          "isWriteIn": true,
          "name": "Write-In",
        },
      ],
      "5": Array [
        Object {
          "id": "51",
          "incumbent": true,
          "name": "John Ames",
          "partyId": "2",
        },
      ],
      "6": Array [
        Object {
          "id": "62",
          "name": "Chad Prda",
          "partyId": "3",
        },
      ],
      "7": Array [
        Object {
          "id": "73",
          "name": "Andrew Jewell",
          "partyId": "7",
        },
      ],
    }
  `)
})

test('invalid marks', async () => {
  const interpreter = new Interpreter(election)

  await interpreter.addTemplate(await templatePage1.imageData())
  await interpreter.addTemplate(await templatePage2.imageData())

  const { ballot } = await interpreter.interpretBallot(
    await fullVotesPage2.imageData()
  )
  // TODO: communicate invalid marks somehow instead of just ignoring them
  expect(ballot.votes).toMatchInlineSnapshot(`
    Object {
      "10": Array [
        Object {
          "id": "rupp",
          "name": "Randall Rupp",
          "partyId": "2",
        },
        Object {
          "id": "__write-in",
          "isWriteIn": true,
          "name": "Write-In",
        },
      ],
      "9": "yes",
    }
  `)
})
