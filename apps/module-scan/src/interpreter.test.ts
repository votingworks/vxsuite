import { AdjudicationReason, electionSample } from '@votingworks/ballot-encoder'
import { readFile } from 'fs-extra'
import { join } from 'path'
import choctaw2020Election from '../test/fixtures/2020-choctaw/election'
import choctaw2020SpecialElection from '../test/fixtures/choctaw-2020-09-22-02f807b005/election'
import * as choctaw2020SpecialFixtures from '../test/fixtures/choctaw-2020-09-22-02f807b005/fixtures'
import stateOfHamiltonElection from '../test/fixtures/state-of-hamilton/election'
import SummaryBallotInterpreter, {
  getBallotImageData,
  InterpretedHmpbPage,
  sheetRequiresAdjudication,
  UninterpretedHmpbPage,
} from './interpreter'
import { DefaultMarkThresholds } from './store'
import { resultError, resultValue } from './types'
import pdfToImages from './util/pdfToImages'
import { metadataFromBytes } from '@votingworks/hmpb-interpreter'

const sampleBallotImagesPath = join(__dirname, '..', 'sample-ballot-images/')
const stateOfHamiltonFixturesRoot = join(
  __dirname,
  '..',
  'test/fixtures/state-of-hamilton'
)
const choctaw2020FixturesRoot = join(
  __dirname,
  '..',
  'test/fixtures/2020-choctaw'
)

test('reads QR codes from ballot images #1', async () => {
  const filepath = join(sampleBallotImagesPath, 'sample-batch-1-ballot-1.jpg')
  const { qrcode } = resultValue(
    await getBallotImageData(await readFile(filepath), filepath)
  )

  expect(qrcode).toEqual(
    Buffer.from('12.23.1|||||||||||||||||||.r6UYR4t7hEFMz8QlMWf1Sw')
  )
})

test('reads QR codes from ballot images #2', async () => {
  const filepath = join(sampleBallotImagesPath, 'sample-batch-1-ballot-2.jpg')
  const { qrcode } = resultValue(
    await getBallotImageData(await readFile(filepath), filepath)
  )

  expect(qrcode).toEqual(
    Buffer.from(
      '12.23.3|1|1|1|0|0|||0,2,W||1|2|1|0||||1||0.85lnPkvfNEytP3Z8gMoEcA'
    )
  )
})

test('does not find QR codes when there are none to find', async () => {
  const filepath = join(sampleBallotImagesPath, 'not-a-ballot.jpg')
  expect(
    resultError(await getBallotImageData(await readFile(filepath), filepath))
  ).toEqual({ type: 'UnreadablePage', reason: 'No QR code found' })
})

test('extracts votes encoded in a QR code', async () => {
  const ballotImagePath = join(
    sampleBallotImagesPath,
    'sample-batch-1-ballot-1.jpg'
  )
  expect(
    (
      await new SummaryBallotInterpreter().interpretFile({
        election: electionSample,
        ballotImagePath,
        ballotImageFile: await readFile(ballotImagePath),
      })
    ).interpretation
  ).toMatchInlineSnapshot(`
    Object {
      "ballotId": "r6UYR4t7hEFMz8QlMWf1Sw",
      "metadata": Object {
        "ballotStyleId": "12",
        "ballotType": 0,
        "electionHash": "",
        "isTestMode": false,
        "locales": Object {
          "primary": "en-US",
        },
        "precinctId": "23",
      },
      "type": "InterpretedBmdPage",
      "votes": Object {
        "president": Array [
          Object {
            "id": "cramer-vuocolo",
            "name": "Adam Cramer and Greg Vuocolo",
            "partyId": "1",
          },
        ],
      },
    }
  `)
})

test('can read metadata encoded in a QR code with base64', async () => {
  const { qrcode } = resultValue(
    await getBallotImageData(
      await readFile(choctaw2020SpecialFixtures.blankPage1),
      choctaw2020SpecialFixtures.blankPage1
    )
  )

  expect(metadataFromBytes(choctaw2020SpecialElection, qrcode))
    .toMatchInlineSnapshot(`
    Object {
      "ballotId": undefined,
      "ballotStyleId": "1",
      "ballotType": 0,
      "electionHash": "02f807b005e006da160b",
      "isTestMode": false,
      "locales": Object {
        "primary": "en-US",
        "secondary": undefined,
      },
      "pageNumber": 1,
      "precinctId": "6538",
    }
  `)
})

test('interprets marks on a HMPB', async () => {
  const interpreter = new SummaryBallotInterpreter()

  interpreter.setTestMode(false)

  for await (const { page, pageNumber } of pdfToImages(
    await readFile(join(stateOfHamiltonFixturesRoot, 'ballot.pdf')),
    { scale: 2 }
  )) {
    await interpreter.addHmpbTemplate(stateOfHamiltonElection, page)

    if (pageNumber === 1) {
      break
    }
  }

  const ballotImagePath = join(
    stateOfHamiltonFixturesRoot,
    'filled-in-dual-language-p1.jpg'
  )
  const votes = ((
    await interpreter.interpretFile({
      election: stateOfHamiltonElection,
      ballotImagePath,
      ballotImageFile: await readFile(ballotImagePath),
    })
  ).interpretation as InterpretedHmpbPage).votes

  expect(votes).toMatchInlineSnapshot(`
    Object {
      "president": Array [
        Object {
          "id": "barchi-hallaren",
          "name": "Joseph Barchi and Joseph Hallaren",
          "partyId": "0",
        },
      ],
      "representative-district-6": Array [
        Object {
          "id": "schott",
          "name": "Brad Schott",
          "partyId": "2",
        },
      ],
      "senator": Array [
        Object {
          "id": "brown",
          "name": "David Brown",
          "partyId": "6",
        },
      ],
    }
  `)
})

test('interprets marks on an upside-down HMPB', async () => {
  const interpreter = new SummaryBallotInterpreter()

  interpreter.setTestMode(false)

  for await (const { page, pageNumber } of pdfToImages(
    await readFile(join(stateOfHamiltonFixturesRoot, 'ballot.pdf')),
    { scale: 2 }
  )) {
    await interpreter.addHmpbTemplate(stateOfHamiltonElection, page)

    if (pageNumber === 1) {
      break
    }
  }

  const ballotImagePath = join(
    stateOfHamiltonFixturesRoot,
    'filled-in-dual-language-p1-flipped.jpg'
  )
  expect(
    (
      await interpreter.interpretFile({
        election: stateOfHamiltonElection,
        ballotImagePath,
        ballotImageFile: await readFile(ballotImagePath),
      })
    ).interpretation as InterpretedHmpbPage
  ).toMatchInlineSnapshot(`
    Object {
      "adjudicationInfo": Object {
        "allReasonInfos": Array [],
        "enabledReasons": Array [
          "UninterpretableBallot",
          "MarginalMark",
        ],
        "requiresAdjudication": false,
      },
      "markInfo": Object {
        "ballotSize": Object {
          "height": 1584,
          "width": 1224,
        },
        "marks": Array [
          Object {
            "bounds": Object {
              "height": 21,
              "width": 31,
              "x": 451,
              "y": 232,
            },
            "contest": Object {
              "_lang": Object {
                "es-US": Object {
                  "section": "Estados Unidos",
                  "title": "Presidente y Vicepresidente",
                },
              },
              "allowWriteIns": false,
              "candidates": Array [
                Object {
                  "id": "barchi-hallaren",
                  "name": "Joseph Barchi and Joseph Hallaren",
                  "partyId": "0",
                },
                Object {
                  "id": "cramer-vuocolo",
                  "name": "Adam Cramer and Greg Vuocolo",
                  "partyId": "1",
                },
                Object {
                  "id": "court-blumhardt",
                  "name": "Daniel Court and Amy Blumhardt",
                  "partyId": "2",
                },
                Object {
                  "id": "boone-lian",
                  "name": "Alvin Boone and James Lian",
                  "partyId": "3",
                },
                Object {
                  "id": "hildebrand-garritty",
                  "name": "Ashley Hildebrand-McDougall and James Garritty",
                  "partyId": "4",
                },
                Object {
                  "id": "patterson-lariviere",
                  "name": "Martin Patterson and Clay Lariviere",
                  "partyId": "5",
                },
              ],
              "districtId": "district-1",
              "id": "president",
              "seats": 1,
              "section": "United States",
              "title": "President and Vice-President",
              "type": "candidate",
            },
            "option": Object {
              "id": "barchi-hallaren",
              "name": "Joseph Barchi and Joseph Hallaren",
              "partyId": "0",
            },
            "score": 0.47790055248618785,
            "target": Object {
              "bounds": Object {
                "height": 21,
                "width": 31,
                "x": 451,
                "y": 232,
              },
              "inner": Object {
                "height": 17,
                "width": 27,
                "x": 453,
                "y": 234,
              },
            },
            "type": "candidate",
          },
          Object {
            "bounds": Object {
              "height": 21,
              "width": 31,
              "x": 451,
              "y": 334,
            },
            "contest": Object {
              "_lang": Object {
                "es-US": Object {
                  "section": "Estados Unidos",
                  "title": "Presidente y Vicepresidente",
                },
              },
              "allowWriteIns": false,
              "candidates": Array [
                Object {
                  "id": "barchi-hallaren",
                  "name": "Joseph Barchi and Joseph Hallaren",
                  "partyId": "0",
                },
                Object {
                  "id": "cramer-vuocolo",
                  "name": "Adam Cramer and Greg Vuocolo",
                  "partyId": "1",
                },
                Object {
                  "id": "court-blumhardt",
                  "name": "Daniel Court and Amy Blumhardt",
                  "partyId": "2",
                },
                Object {
                  "id": "boone-lian",
                  "name": "Alvin Boone and James Lian",
                  "partyId": "3",
                },
                Object {
                  "id": "hildebrand-garritty",
                  "name": "Ashley Hildebrand-McDougall and James Garritty",
                  "partyId": "4",
                },
                Object {
                  "id": "patterson-lariviere",
                  "name": "Martin Patterson and Clay Lariviere",
                  "partyId": "5",
                },
              ],
              "districtId": "district-1",
              "id": "president",
              "seats": 1,
              "section": "United States",
              "title": "President and Vice-President",
              "type": "candidate",
            },
            "option": Object {
              "id": "cramer-vuocolo",
              "name": "Adam Cramer and Greg Vuocolo",
              "partyId": "1",
            },
            "score": 0,
            "target": Object {
              "bounds": Object {
                "height": 21,
                "width": 31,
                "x": 451,
                "y": 334,
              },
              "inner": Object {
                "height": 17,
                "width": 27,
                "x": 453,
                "y": 336,
              },
            },
            "type": "candidate",
          },
          Object {
            "bounds": Object {
              "height": 21,
              "width": 31,
              "x": 451,
              "y": 436,
            },
            "contest": Object {
              "_lang": Object {
                "es-US": Object {
                  "section": "Estados Unidos",
                  "title": "Presidente y Vicepresidente",
                },
              },
              "allowWriteIns": false,
              "candidates": Array [
                Object {
                  "id": "barchi-hallaren",
                  "name": "Joseph Barchi and Joseph Hallaren",
                  "partyId": "0",
                },
                Object {
                  "id": "cramer-vuocolo",
                  "name": "Adam Cramer and Greg Vuocolo",
                  "partyId": "1",
                },
                Object {
                  "id": "court-blumhardt",
                  "name": "Daniel Court and Amy Blumhardt",
                  "partyId": "2",
                },
                Object {
                  "id": "boone-lian",
                  "name": "Alvin Boone and James Lian",
                  "partyId": "3",
                },
                Object {
                  "id": "hildebrand-garritty",
                  "name": "Ashley Hildebrand-McDougall and James Garritty",
                  "partyId": "4",
                },
                Object {
                  "id": "patterson-lariviere",
                  "name": "Martin Patterson and Clay Lariviere",
                  "partyId": "5",
                },
              ],
              "districtId": "district-1",
              "id": "president",
              "seats": 1,
              "section": "United States",
              "title": "President and Vice-President",
              "type": "candidate",
            },
            "option": Object {
              "id": "court-blumhardt",
              "name": "Daniel Court and Amy Blumhardt",
              "partyId": "2",
            },
            "score": 0,
            "target": Object {
              "bounds": Object {
                "height": 21,
                "width": 31,
                "x": 451,
                "y": 436,
              },
              "inner": Object {
                "height": 17,
                "width": 27,
                "x": 453,
                "y": 438,
              },
            },
            "type": "candidate",
          },
          Object {
            "bounds": Object {
              "height": 21,
              "width": 31,
              "x": 451,
              "y": 538,
            },
            "contest": Object {
              "_lang": Object {
                "es-US": Object {
                  "section": "Estados Unidos",
                  "title": "Presidente y Vicepresidente",
                },
              },
              "allowWriteIns": false,
              "candidates": Array [
                Object {
                  "id": "barchi-hallaren",
                  "name": "Joseph Barchi and Joseph Hallaren",
                  "partyId": "0",
                },
                Object {
                  "id": "cramer-vuocolo",
                  "name": "Adam Cramer and Greg Vuocolo",
                  "partyId": "1",
                },
                Object {
                  "id": "court-blumhardt",
                  "name": "Daniel Court and Amy Blumhardt",
                  "partyId": "2",
                },
                Object {
                  "id": "boone-lian",
                  "name": "Alvin Boone and James Lian",
                  "partyId": "3",
                },
                Object {
                  "id": "hildebrand-garritty",
                  "name": "Ashley Hildebrand-McDougall and James Garritty",
                  "partyId": "4",
                },
                Object {
                  "id": "patterson-lariviere",
                  "name": "Martin Patterson and Clay Lariviere",
                  "partyId": "5",
                },
              ],
              "districtId": "district-1",
              "id": "president",
              "seats": 1,
              "section": "United States",
              "title": "President and Vice-President",
              "type": "candidate",
            },
            "option": Object {
              "id": "boone-lian",
              "name": "Alvin Boone and James Lian",
              "partyId": "3",
            },
            "score": 0,
            "target": Object {
              "bounds": Object {
                "height": 21,
                "width": 31,
                "x": 451,
                "y": 538,
              },
              "inner": Object {
                "height": 17,
                "width": 27,
                "x": 453,
                "y": 540,
              },
            },
            "type": "candidate",
          },
          Object {
            "bounds": Object {
              "height": 21,
              "width": 31,
              "x": 451,
              "y": 613,
            },
            "contest": Object {
              "_lang": Object {
                "es-US": Object {
                  "section": "Estados Unidos",
                  "title": "Presidente y Vicepresidente",
                },
              },
              "allowWriteIns": false,
              "candidates": Array [
                Object {
                  "id": "barchi-hallaren",
                  "name": "Joseph Barchi and Joseph Hallaren",
                  "partyId": "0",
                },
                Object {
                  "id": "cramer-vuocolo",
                  "name": "Adam Cramer and Greg Vuocolo",
                  "partyId": "1",
                },
                Object {
                  "id": "court-blumhardt",
                  "name": "Daniel Court and Amy Blumhardt",
                  "partyId": "2",
                },
                Object {
                  "id": "boone-lian",
                  "name": "Alvin Boone and James Lian",
                  "partyId": "3",
                },
                Object {
                  "id": "hildebrand-garritty",
                  "name": "Ashley Hildebrand-McDougall and James Garritty",
                  "partyId": "4",
                },
                Object {
                  "id": "patterson-lariviere",
                  "name": "Martin Patterson and Clay Lariviere",
                  "partyId": "5",
                },
              ],
              "districtId": "district-1",
              "id": "president",
              "seats": 1,
              "section": "United States",
              "title": "President and Vice-President",
              "type": "candidate",
            },
            "option": Object {
              "id": "hildebrand-garritty",
              "name": "Ashley Hildebrand-McDougall and James Garritty",
              "partyId": "4",
            },
            "score": 0,
            "target": Object {
              "bounds": Object {
                "height": 21,
                "width": 31,
                "x": 451,
                "y": 613,
              },
              "inner": Object {
                "height": 17,
                "width": 27,
                "x": 453,
                "y": 615,
              },
            },
            "type": "candidate",
          },
          Object {
            "bounds": Object {
              "height": 21,
              "width": 31,
              "x": 451,
              "y": 742,
            },
            "contest": Object {
              "_lang": Object {
                "es-US": Object {
                  "section": "Estados Unidos",
                  "title": "Presidente y Vicepresidente",
                },
              },
              "allowWriteIns": false,
              "candidates": Array [
                Object {
                  "id": "barchi-hallaren",
                  "name": "Joseph Barchi and Joseph Hallaren",
                  "partyId": "0",
                },
                Object {
                  "id": "cramer-vuocolo",
                  "name": "Adam Cramer and Greg Vuocolo",
                  "partyId": "1",
                },
                Object {
                  "id": "court-blumhardt",
                  "name": "Daniel Court and Amy Blumhardt",
                  "partyId": "2",
                },
                Object {
                  "id": "boone-lian",
                  "name": "Alvin Boone and James Lian",
                  "partyId": "3",
                },
                Object {
                  "id": "hildebrand-garritty",
                  "name": "Ashley Hildebrand-McDougall and James Garritty",
                  "partyId": "4",
                },
                Object {
                  "id": "patterson-lariviere",
                  "name": "Martin Patterson and Clay Lariviere",
                  "partyId": "5",
                },
              ],
              "districtId": "district-1",
              "id": "president",
              "seats": 1,
              "section": "United States",
              "title": "President and Vice-President",
              "type": "candidate",
            },
            "option": Object {
              "id": "patterson-lariviere",
              "name": "Martin Patterson and Clay Lariviere",
              "partyId": "5",
            },
            "score": 0.011049723756906077,
            "target": Object {
              "bounds": Object {
                "height": 21,
                "width": 31,
                "x": 451,
                "y": 742,
              },
              "inner": Object {
                "height": 17,
                "width": 27,
                "x": 453,
                "y": 744,
              },
            },
            "type": "candidate",
          },
          Object {
            "bounds": Object {
              "height": 20,
              "width": 31,
              "x": 837,
              "y": 168,
            },
            "contest": Object {
              "_lang": Object {
                "es-US": Object {
                  "section": "Estados Unidos",
                  "title": "Senador",
                },
              },
              "allowWriteIns": false,
              "candidates": Array [
                Object {
                  "id": "weiford",
                  "name": "Dennis Weiford",
                  "partyId": "0",
                },
                Object {
                  "id": "garriss",
                  "name": "Lloyd Garriss",
                  "partyId": "1",
                },
                Object {
                  "id": "wentworthfarthington",
                  "name": "Sylvia Wentworth-Farthington",
                  "partyId": "2",
                },
                Object {
                  "id": "hewetson",
                  "name": "Heather Hewetson",
                  "partyId": "3",
                },
                Object {
                  "id": "martinez",
                  "name": "Victor Martinez",
                  "partyId": "4",
                },
                Object {
                  "id": "brown",
                  "name": "David Brown",
                  "partyId": "6",
                },
                Object {
                  "id": "pound",
                  "name": "David Pound",
                  "partyId": "6",
                },
              ],
              "districtId": "district-2",
              "id": "senator",
              "seats": 1,
              "section": "United States",
              "title": "Senator",
              "type": "candidate",
            },
            "option": Object {
              "id": "weiford",
              "name": "Dennis Weiford",
              "partyId": "0",
            },
            "score": 0,
            "target": Object {
              "bounds": Object {
                "height": 20,
                "width": 31,
                "x": 837,
                "y": 168,
              },
              "inner": Object {
                "height": 16,
                "width": 27,
                "x": 839,
                "y": 170,
              },
            },
            "type": "candidate",
          },
          Object {
            "bounds": Object {
              "height": 20,
              "width": 31,
              "x": 837,
              "y": 243,
            },
            "contest": Object {
              "_lang": Object {
                "es-US": Object {
                  "section": "Estados Unidos",
                  "title": "Senador",
                },
              },
              "allowWriteIns": false,
              "candidates": Array [
                Object {
                  "id": "weiford",
                  "name": "Dennis Weiford",
                  "partyId": "0",
                },
                Object {
                  "id": "garriss",
                  "name": "Lloyd Garriss",
                  "partyId": "1",
                },
                Object {
                  "id": "wentworthfarthington",
                  "name": "Sylvia Wentworth-Farthington",
                  "partyId": "2",
                },
                Object {
                  "id": "hewetson",
                  "name": "Heather Hewetson",
                  "partyId": "3",
                },
                Object {
                  "id": "martinez",
                  "name": "Victor Martinez",
                  "partyId": "4",
                },
                Object {
                  "id": "brown",
                  "name": "David Brown",
                  "partyId": "6",
                },
                Object {
                  "id": "pound",
                  "name": "David Pound",
                  "partyId": "6",
                },
              ],
              "districtId": "district-2",
              "id": "senator",
              "seats": 1,
              "section": "United States",
              "title": "Senator",
              "type": "candidate",
            },
            "option": Object {
              "id": "garriss",
              "name": "Lloyd Garriss",
              "partyId": "1",
            },
            "score": 0,
            "target": Object {
              "bounds": Object {
                "height": 20,
                "width": 31,
                "x": 837,
                "y": 243,
              },
              "inner": Object {
                "height": 16,
                "width": 27,
                "x": 839,
                "y": 245,
              },
            },
            "type": "candidate",
          },
          Object {
            "bounds": Object {
              "height": 20,
              "width": 31,
              "x": 837,
              "y": 318,
            },
            "contest": Object {
              "_lang": Object {
                "es-US": Object {
                  "section": "Estados Unidos",
                  "title": "Senador",
                },
              },
              "allowWriteIns": false,
              "candidates": Array [
                Object {
                  "id": "weiford",
                  "name": "Dennis Weiford",
                  "partyId": "0",
                },
                Object {
                  "id": "garriss",
                  "name": "Lloyd Garriss",
                  "partyId": "1",
                },
                Object {
                  "id": "wentworthfarthington",
                  "name": "Sylvia Wentworth-Farthington",
                  "partyId": "2",
                },
                Object {
                  "id": "hewetson",
                  "name": "Heather Hewetson",
                  "partyId": "3",
                },
                Object {
                  "id": "martinez",
                  "name": "Victor Martinez",
                  "partyId": "4",
                },
                Object {
                  "id": "brown",
                  "name": "David Brown",
                  "partyId": "6",
                },
                Object {
                  "id": "pound",
                  "name": "David Pound",
                  "partyId": "6",
                },
              ],
              "districtId": "district-2",
              "id": "senator",
              "seats": 1,
              "section": "United States",
              "title": "Senator",
              "type": "candidate",
            },
            "option": Object {
              "id": "wentworthfarthington",
              "name": "Sylvia Wentworth-Farthington",
              "partyId": "2",
            },
            "score": 0,
            "target": Object {
              "bounds": Object {
                "height": 20,
                "width": 31,
                "x": 837,
                "y": 318,
              },
              "inner": Object {
                "height": 16,
                "width": 27,
                "x": 839,
                "y": 320,
              },
            },
            "type": "candidate",
          },
          Object {
            "bounds": Object {
              "height": 20,
              "width": 31,
              "x": 837,
              "y": 420,
            },
            "contest": Object {
              "_lang": Object {
                "es-US": Object {
                  "section": "Estados Unidos",
                  "title": "Senador",
                },
              },
              "allowWriteIns": false,
              "candidates": Array [
                Object {
                  "id": "weiford",
                  "name": "Dennis Weiford",
                  "partyId": "0",
                },
                Object {
                  "id": "garriss",
                  "name": "Lloyd Garriss",
                  "partyId": "1",
                },
                Object {
                  "id": "wentworthfarthington",
                  "name": "Sylvia Wentworth-Farthington",
                  "partyId": "2",
                },
                Object {
                  "id": "hewetson",
                  "name": "Heather Hewetson",
                  "partyId": "3",
                },
                Object {
                  "id": "martinez",
                  "name": "Victor Martinez",
                  "partyId": "4",
                },
                Object {
                  "id": "brown",
                  "name": "David Brown",
                  "partyId": "6",
                },
                Object {
                  "id": "pound",
                  "name": "David Pound",
                  "partyId": "6",
                },
              ],
              "districtId": "district-2",
              "id": "senator",
              "seats": 1,
              "section": "United States",
              "title": "Senator",
              "type": "candidate",
            },
            "option": Object {
              "id": "hewetson",
              "name": "Heather Hewetson",
              "partyId": "3",
            },
            "score": 0,
            "target": Object {
              "bounds": Object {
                "height": 20,
                "width": 31,
                "x": 837,
                "y": 420,
              },
              "inner": Object {
                "height": 16,
                "width": 27,
                "x": 839,
                "y": 422,
              },
            },
            "type": "candidate",
          },
          Object {
            "bounds": Object {
              "height": 20,
              "width": 31,
              "x": 837,
              "y": 495,
            },
            "contest": Object {
              "_lang": Object {
                "es-US": Object {
                  "section": "Estados Unidos",
                  "title": "Senador",
                },
              },
              "allowWriteIns": false,
              "candidates": Array [
                Object {
                  "id": "weiford",
                  "name": "Dennis Weiford",
                  "partyId": "0",
                },
                Object {
                  "id": "garriss",
                  "name": "Lloyd Garriss",
                  "partyId": "1",
                },
                Object {
                  "id": "wentworthfarthington",
                  "name": "Sylvia Wentworth-Farthington",
                  "partyId": "2",
                },
                Object {
                  "id": "hewetson",
                  "name": "Heather Hewetson",
                  "partyId": "3",
                },
                Object {
                  "id": "martinez",
                  "name": "Victor Martinez",
                  "partyId": "4",
                },
                Object {
                  "id": "brown",
                  "name": "David Brown",
                  "partyId": "6",
                },
                Object {
                  "id": "pound",
                  "name": "David Pound",
                  "partyId": "6",
                },
              ],
              "districtId": "district-2",
              "id": "senator",
              "seats": 1,
              "section": "United States",
              "title": "Senator",
              "type": "candidate",
            },
            "option": Object {
              "id": "martinez",
              "name": "Victor Martinez",
              "partyId": "4",
            },
            "score": 0,
            "target": Object {
              "bounds": Object {
                "height": 20,
                "width": 31,
                "x": 837,
                "y": 495,
              },
              "inner": Object {
                "height": 16,
                "width": 27,
                "x": 839,
                "y": 497,
              },
            },
            "type": "candidate",
          },
          Object {
            "bounds": Object {
              "height": 20,
              "width": 31,
              "x": 837,
              "y": 570,
            },
            "contest": Object {
              "_lang": Object {
                "es-US": Object {
                  "section": "Estados Unidos",
                  "title": "Senador",
                },
              },
              "allowWriteIns": false,
              "candidates": Array [
                Object {
                  "id": "weiford",
                  "name": "Dennis Weiford",
                  "partyId": "0",
                },
                Object {
                  "id": "garriss",
                  "name": "Lloyd Garriss",
                  "partyId": "1",
                },
                Object {
                  "id": "wentworthfarthington",
                  "name": "Sylvia Wentworth-Farthington",
                  "partyId": "2",
                },
                Object {
                  "id": "hewetson",
                  "name": "Heather Hewetson",
                  "partyId": "3",
                },
                Object {
                  "id": "martinez",
                  "name": "Victor Martinez",
                  "partyId": "4",
                },
                Object {
                  "id": "brown",
                  "name": "David Brown",
                  "partyId": "6",
                },
                Object {
                  "id": "pound",
                  "name": "David Pound",
                  "partyId": "6",
                },
              ],
              "districtId": "district-2",
              "id": "senator",
              "seats": 1,
              "section": "United States",
              "title": "Senator",
              "type": "candidate",
            },
            "option": Object {
              "id": "brown",
              "name": "David Brown",
              "partyId": "6",
            },
            "score": 0.384180790960452,
            "target": Object {
              "bounds": Object {
                "height": 20,
                "width": 31,
                "x": 837,
                "y": 570,
              },
              "inner": Object {
                "height": 16,
                "width": 27,
                "x": 839,
                "y": 572,
              },
            },
            "type": "candidate",
          },
          Object {
            "bounds": Object {
              "height": 20,
              "width": 31,
              "x": 837,
              "y": 663,
            },
            "contest": Object {
              "_lang": Object {
                "es-US": Object {
                  "section": "Estados Unidos",
                  "title": "Senador",
                },
              },
              "allowWriteIns": false,
              "candidates": Array [
                Object {
                  "id": "weiford",
                  "name": "Dennis Weiford",
                  "partyId": "0",
                },
                Object {
                  "id": "garriss",
                  "name": "Lloyd Garriss",
                  "partyId": "1",
                },
                Object {
                  "id": "wentworthfarthington",
                  "name": "Sylvia Wentworth-Farthington",
                  "partyId": "2",
                },
                Object {
                  "id": "hewetson",
                  "name": "Heather Hewetson",
                  "partyId": "3",
                },
                Object {
                  "id": "martinez",
                  "name": "Victor Martinez",
                  "partyId": "4",
                },
                Object {
                  "id": "brown",
                  "name": "David Brown",
                  "partyId": "6",
                },
                Object {
                  "id": "pound",
                  "name": "David Pound",
                  "partyId": "6",
                },
              ],
              "districtId": "district-2",
              "id": "senator",
              "seats": 1,
              "section": "United States",
              "title": "Senator",
              "type": "candidate",
            },
            "option": Object {
              "id": "pound",
              "name": "David Pound",
              "partyId": "6",
            },
            "score": 0,
            "target": Object {
              "bounds": Object {
                "height": 20,
                "width": 31,
                "x": 837,
                "y": 663,
              },
              "inner": Object {
                "height": 16,
                "width": 27,
                "x": 839,
                "y": 665,
              },
            },
            "type": "candidate",
          },
          Object {
            "bounds": Object {
              "height": 21,
              "width": 31,
              "x": 837,
              "y": 913,
            },
            "contest": Object {
              "_lang": Object {
                "es-US": Object {
                  "section": "Estados Unidos",
                  "title": "Representante, Distrito 6",
                },
              },
              "allowWriteIns": false,
              "candidates": Array [
                Object {
                  "id": "plunkard",
                  "name": "Brad Plunkard",
                  "partyId": "0",
                },
                Object {
                  "id": "reeder",
                  "name": "Bruce Reeder",
                  "partyId": "1",
                },
                Object {
                  "id": "schott",
                  "name": "Brad Schott",
                  "partyId": "2",
                },
                Object {
                  "id": "tawney",
                  "name": "Glen Tawney",
                  "partyId": "3",
                },
                Object {
                  "id": "forrest",
                  "name": "Carroll Forrest",
                  "partyId": "4",
                },
              ],
              "districtId": "district-1",
              "id": "representative-district-6",
              "seats": 1,
              "section": "United States",
              "title": "Representative, District 6",
              "type": "candidate",
            },
            "option": Object {
              "id": "plunkard",
              "name": "Brad Plunkard",
              "partyId": "0",
            },
            "score": 0,
            "target": Object {
              "bounds": Object {
                "height": 21,
                "width": 31,
                "x": 837,
                "y": 913,
              },
              "inner": Object {
                "height": 17,
                "width": 27,
                "x": 839,
                "y": 915,
              },
            },
            "type": "candidate",
          },
          Object {
            "bounds": Object {
              "height": 21,
              "width": 31,
              "x": 837,
              "y": 988,
            },
            "contest": Object {
              "_lang": Object {
                "es-US": Object {
                  "section": "Estados Unidos",
                  "title": "Representante, Distrito 6",
                },
              },
              "allowWriteIns": false,
              "candidates": Array [
                Object {
                  "id": "plunkard",
                  "name": "Brad Plunkard",
                  "partyId": "0",
                },
                Object {
                  "id": "reeder",
                  "name": "Bruce Reeder",
                  "partyId": "1",
                },
                Object {
                  "id": "schott",
                  "name": "Brad Schott",
                  "partyId": "2",
                },
                Object {
                  "id": "tawney",
                  "name": "Glen Tawney",
                  "partyId": "3",
                },
                Object {
                  "id": "forrest",
                  "name": "Carroll Forrest",
                  "partyId": "4",
                },
              ],
              "districtId": "district-1",
              "id": "representative-district-6",
              "seats": 1,
              "section": "United States",
              "title": "Representative, District 6",
              "type": "candidate",
            },
            "option": Object {
              "id": "reeder",
              "name": "Bruce Reeder",
              "partyId": "1",
            },
            "score": 0,
            "target": Object {
              "bounds": Object {
                "height": 21,
                "width": 31,
                "x": 837,
                "y": 988,
              },
              "inner": Object {
                "height": 17,
                "width": 27,
                "x": 839,
                "y": 990,
              },
            },
            "type": "candidate",
          },
          Object {
            "bounds": Object {
              "height": 21,
              "width": 31,
              "x": 837,
              "y": 1063,
            },
            "contest": Object {
              "_lang": Object {
                "es-US": Object {
                  "section": "Estados Unidos",
                  "title": "Representante, Distrito 6",
                },
              },
              "allowWriteIns": false,
              "candidates": Array [
                Object {
                  "id": "plunkard",
                  "name": "Brad Plunkard",
                  "partyId": "0",
                },
                Object {
                  "id": "reeder",
                  "name": "Bruce Reeder",
                  "partyId": "1",
                },
                Object {
                  "id": "schott",
                  "name": "Brad Schott",
                  "partyId": "2",
                },
                Object {
                  "id": "tawney",
                  "name": "Glen Tawney",
                  "partyId": "3",
                },
                Object {
                  "id": "forrest",
                  "name": "Carroll Forrest",
                  "partyId": "4",
                },
              ],
              "districtId": "district-1",
              "id": "representative-district-6",
              "seats": 1,
              "section": "United States",
              "title": "Representative, District 6",
              "type": "candidate",
            },
            "option": Object {
              "id": "schott",
              "name": "Brad Schott",
              "partyId": "2",
            },
            "score": 0.7265193370165746,
            "target": Object {
              "bounds": Object {
                "height": 21,
                "width": 31,
                "x": 837,
                "y": 1063,
              },
              "inner": Object {
                "height": 17,
                "width": 27,
                "x": 839,
                "y": 1065,
              },
            },
            "type": "candidate",
          },
          Object {
            "bounds": Object {
              "height": 21,
              "width": 31,
              "x": 837,
              "y": 1138,
            },
            "contest": Object {
              "_lang": Object {
                "es-US": Object {
                  "section": "Estados Unidos",
                  "title": "Representante, Distrito 6",
                },
              },
              "allowWriteIns": false,
              "candidates": Array [
                Object {
                  "id": "plunkard",
                  "name": "Brad Plunkard",
                  "partyId": "0",
                },
                Object {
                  "id": "reeder",
                  "name": "Bruce Reeder",
                  "partyId": "1",
                },
                Object {
                  "id": "schott",
                  "name": "Brad Schott",
                  "partyId": "2",
                },
                Object {
                  "id": "tawney",
                  "name": "Glen Tawney",
                  "partyId": "3",
                },
                Object {
                  "id": "forrest",
                  "name": "Carroll Forrest",
                  "partyId": "4",
                },
              ],
              "districtId": "district-1",
              "id": "representative-district-6",
              "seats": 1,
              "section": "United States",
              "title": "Representative, District 6",
              "type": "candidate",
            },
            "option": Object {
              "id": "tawney",
              "name": "Glen Tawney",
              "partyId": "3",
            },
            "score": 0,
            "target": Object {
              "bounds": Object {
                "height": 21,
                "width": 31,
                "x": 837,
                "y": 1138,
              },
              "inner": Object {
                "height": 17,
                "width": 27,
                "x": 839,
                "y": 1140,
              },
            },
            "type": "candidate",
          },
          Object {
            "bounds": Object {
              "height": 21,
              "width": 31,
              "x": 837,
              "y": 1213,
            },
            "contest": Object {
              "_lang": Object {
                "es-US": Object {
                  "section": "Estados Unidos",
                  "title": "Representante, Distrito 6",
                },
              },
              "allowWriteIns": false,
              "candidates": Array [
                Object {
                  "id": "plunkard",
                  "name": "Brad Plunkard",
                  "partyId": "0",
                },
                Object {
                  "id": "reeder",
                  "name": "Bruce Reeder",
                  "partyId": "1",
                },
                Object {
                  "id": "schott",
                  "name": "Brad Schott",
                  "partyId": "2",
                },
                Object {
                  "id": "tawney",
                  "name": "Glen Tawney",
                  "partyId": "3",
                },
                Object {
                  "id": "forrest",
                  "name": "Carroll Forrest",
                  "partyId": "4",
                },
              ],
              "districtId": "district-1",
              "id": "representative-district-6",
              "seats": 1,
              "section": "United States",
              "title": "Representative, District 6",
              "type": "candidate",
            },
            "option": Object {
              "id": "forrest",
              "name": "Carroll Forrest",
              "partyId": "4",
            },
            "score": 0,
            "target": Object {
              "bounds": Object {
                "height": 21,
                "width": 31,
                "x": 837,
                "y": 1213,
              },
              "inner": Object {
                "height": 17,
                "width": 27,
                "x": 839,
                "y": 1215,
              },
            },
            "type": "candidate",
          },
        ],
      },
      "metadata": Object {
        "ballotStyleId": "12",
        "ballotType": 0,
        "electionHash": "",
        "isTestMode": false,
        "locales": Object {
          "primary": "en-US",
          "secondary": "es-US",
        },
        "pageNumber": 1,
        "precinctId": "23",
      },
      "type": "InterpretedHmpbPage",
      "votes": Object {
        "president": Array [
          Object {
            "id": "barchi-hallaren",
            "name": "Joseph Barchi and Joseph Hallaren",
            "partyId": "0",
          },
        ],
        "representative-district-6": Array [
          Object {
            "id": "schott",
            "name": "Brad Schott",
            "partyId": "2",
          },
        ],
        "senator": Array [
          Object {
            "id": "brown",
            "name": "David Brown",
            "partyId": "6",
          },
        ],
      },
    }
  `)
})

test('interprets marks in PNG ballots', async () => {
  jest.setTimeout(10000)

  const interpreter = new SummaryBallotInterpreter()

  interpreter.setTestMode(false)

  for await (const { page } of pdfToImages(
    await readFile(join(choctaw2020FixturesRoot, 'ballot.pdf')),
    { scale: 2 }
  )) {
    await interpreter.addHmpbTemplate(choctaw2020Election, page)
  }

  {
    const ballotImagePath = join(choctaw2020FixturesRoot, 'filled-in-p1.png')
    expect(
      (
        await interpreter.interpretFile({
          election: {
            markThresholds: DefaultMarkThresholds,
            ...choctaw2020Election,
          },
          ballotImagePath,
          ballotImageFile: await readFile(ballotImagePath),
        })
      ).interpretation
    ).toMatchInlineSnapshot(`
      Object {
        "adjudicationInfo": Object {
          "allReasonInfos": Array [
            Object {
              "contestId": "4",
              "optionId": "__write-in-0",
              "type": "WriteIn",
            },
            Object {
              "contestId": "initiative-65",
              "expected": 1,
              "optionIds": Array [
                "yes",
                "no",
              ],
              "type": "Overvote",
            },
            Object {
              "contestId": "initiative-65-a",
              "optionId": "yes",
              "type": "MarginalMark",
            },
            Object {
              "contestId": "initiative-65-a",
              "expected": 1,
              "optionIds": Array [],
              "type": "Undervote",
            },
          ],
          "enabledReasons": Array [
            "UninterpretableBallot",
            "MarginalMark",
          ],
          "requiresAdjudication": true,
        },
        "markInfo": Object {
          "ballotSize": Object {
            "height": 1584,
            "width": 1224,
          },
          "marks": Array [
            Object {
              "bounds": Object {
                "height": 21,
                "width": 31,
                "x": 451,
                "y": 166,
              },
              "contest": Object {
                "allowWriteIns": true,
                "candidates": Array [
                  Object {
                    "id": "1",
                    "name": "Joe Biden",
                    "partyId": "2",
                  },
                  Object {
                    "id": "2",
                    "name": "Donald Trump",
                    "partyId": "3",
                  },
                ],
                "districtId": "100000275",
                "id": "1",
                "seats": 1,
                "section": "United States",
                "title": "United States President",
                "type": "candidate",
              },
              "option": Object {
                "id": "1",
                "name": "Joe Biden",
                "partyId": "2",
              },
              "score": 0.2569060773480663,
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 31,
                  "x": 451,
                  "y": 166,
                },
                "inner": Object {
                  "height": 17,
                  "width": 27,
                  "x": 453,
                  "y": 168,
                },
              },
              "type": "candidate",
            },
            Object {
              "bounds": Object {
                "height": 21,
                "width": 31,
                "x": 451,
                "y": 241,
              },
              "contest": Object {
                "allowWriteIns": true,
                "candidates": Array [
                  Object {
                    "id": "1",
                    "name": "Joe Biden",
                    "partyId": "2",
                  },
                  Object {
                    "id": "2",
                    "name": "Donald Trump",
                    "partyId": "3",
                  },
                ],
                "districtId": "100000275",
                "id": "1",
                "seats": 1,
                "section": "United States",
                "title": "United States President",
                "type": "candidate",
              },
              "option": Object {
                "id": "2",
                "name": "Donald Trump",
                "partyId": "3",
              },
              "score": 0,
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 31,
                  "x": 451,
                  "y": 241,
                },
                "inner": Object {
                  "height": 17,
                  "width": 27,
                  "x": 453,
                  "y": 243,
                },
              },
              "type": "candidate",
            },
            Object {
              "bounds": Object {
                "height": 21,
                "width": 31,
                "x": 451,
                "y": 316,
              },
              "contest": Object {
                "allowWriteIns": true,
                "candidates": Array [
                  Object {
                    "id": "1",
                    "name": "Joe Biden",
                    "partyId": "2",
                  },
                  Object {
                    "id": "2",
                    "name": "Donald Trump",
                    "partyId": "3",
                  },
                ],
                "districtId": "100000275",
                "id": "1",
                "seats": 1,
                "section": "United States",
                "title": "United States President",
                "type": "candidate",
              },
              "option": Object {
                "id": "__write-in-0",
                "isWriteIn": true,
                "name": "Write-In",
              },
              "score": 0,
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 31,
                  "x": 451,
                  "y": 316,
                },
                "inner": Object {
                  "height": 17,
                  "width": 27,
                  "x": 453,
                  "y": 318,
                },
              },
              "type": "candidate",
            },
            Object {
              "bounds": Object {
                "height": 20,
                "width": 31,
                "x": 451,
                "y": 525,
              },
              "contest": Object {
                "allowWriteIns": true,
                "candidates": Array [
                  Object {
                    "id": "21",
                    "name": "Mike Espy",
                    "partyId": "2",
                  },
                  Object {
                    "id": "22",
                    "name": "Cindy Hyde-Smith",
                    "partyId": "3",
                  },
                  Object {
                    "id": "23",
                    "name": "Jimmy Edwards",
                    "partyId": "4",
                  },
                ],
                "districtId": "100000275",
                "id": "2",
                "seats": 1,
                "section": "United States",
                "title": "United States Senate",
                "type": "candidate",
              },
              "option": Object {
                "id": "21",
                "name": "Mike Espy",
                "partyId": "2",
              },
              "score": 0,
              "target": Object {
                "bounds": Object {
                  "height": 20,
                  "width": 31,
                  "x": 451,
                  "y": 525,
                },
                "inner": Object {
                  "height": 16,
                  "width": 27,
                  "x": 453,
                  "y": 527,
                },
              },
              "type": "candidate",
            },
            Object {
              "bounds": Object {
                "height": 20,
                "width": 31,
                "x": 451,
                "y": 600,
              },
              "contest": Object {
                "allowWriteIns": true,
                "candidates": Array [
                  Object {
                    "id": "21",
                    "name": "Mike Espy",
                    "partyId": "2",
                  },
                  Object {
                    "id": "22",
                    "name": "Cindy Hyde-Smith",
                    "partyId": "3",
                  },
                  Object {
                    "id": "23",
                    "name": "Jimmy Edwards",
                    "partyId": "4",
                  },
                ],
                "districtId": "100000275",
                "id": "2",
                "seats": 1,
                "section": "United States",
                "title": "United States Senate",
                "type": "candidate",
              },
              "option": Object {
                "id": "22",
                "name": "Cindy Hyde-Smith",
                "partyId": "3",
              },
              "score": 0,
              "target": Object {
                "bounds": Object {
                  "height": 20,
                  "width": 31,
                  "x": 451,
                  "y": 600,
                },
                "inner": Object {
                  "height": 16,
                  "width": 27,
                  "x": 453,
                  "y": 602,
                },
              },
              "type": "candidate",
            },
            Object {
              "bounds": Object {
                "height": 20,
                "width": 31,
                "x": 451,
                "y": 675,
              },
              "contest": Object {
                "allowWriteIns": true,
                "candidates": Array [
                  Object {
                    "id": "21",
                    "name": "Mike Espy",
                    "partyId": "2",
                  },
                  Object {
                    "id": "22",
                    "name": "Cindy Hyde-Smith",
                    "partyId": "3",
                  },
                  Object {
                    "id": "23",
                    "name": "Jimmy Edwards",
                    "partyId": "4",
                  },
                ],
                "districtId": "100000275",
                "id": "2",
                "seats": 1,
                "section": "United States",
                "title": "United States Senate",
                "type": "candidate",
              },
              "option": Object {
                "id": "23",
                "name": "Jimmy Edwards",
                "partyId": "4",
              },
              "score": 0.43103448275862066,
              "target": Object {
                "bounds": Object {
                  "height": 20,
                  "width": 31,
                  "x": 451,
                  "y": 675,
                },
                "inner": Object {
                  "height": 16,
                  "width": 27,
                  "x": 453,
                  "y": 677,
                },
              },
              "type": "candidate",
            },
            Object {
              "bounds": Object {
                "height": 20,
                "width": 31,
                "x": 451,
                "y": 750,
              },
              "contest": Object {
                "allowWriteIns": true,
                "candidates": Array [
                  Object {
                    "id": "21",
                    "name": "Mike Espy",
                    "partyId": "2",
                  },
                  Object {
                    "id": "22",
                    "name": "Cindy Hyde-Smith",
                    "partyId": "3",
                  },
                  Object {
                    "id": "23",
                    "name": "Jimmy Edwards",
                    "partyId": "4",
                  },
                ],
                "districtId": "100000275",
                "id": "2",
                "seats": 1,
                "section": "United States",
                "title": "United States Senate",
                "type": "candidate",
              },
              "option": Object {
                "id": "__write-in-0",
                "isWriteIn": true,
                "name": "Write-In",
              },
              "score": 0,
              "target": Object {
                "bounds": Object {
                  "height": 20,
                  "width": 31,
                  "x": 451,
                  "y": 750,
                },
                "inner": Object {
                  "height": 16,
                  "width": 27,
                  "x": 453,
                  "y": 752,
                },
              },
              "type": "candidate",
            },
            Object {
              "bounds": Object {
                "height": 21,
                "width": 31,
                "x": 451,
                "y": 1021,
              },
              "contest": Object {
                "allowWriteIns": true,
                "candidates": Array [
                  Object {
                    "id": "31",
                    "name": "Antonia Eliason",
                    "partyId": "2",
                  },
                  Object {
                    "id": "32",
                    "name": "Trent Kelly",
                    "partyId": "3",
                  },
                ],
                "districtId": "100000275",
                "id": "3",
                "seats": 1,
                "section": "United States",
                "title": "United States US House of Representatives 1st Congressional District",
                "type": "candidate",
              },
              "option": Object {
                "id": "31",
                "name": "Antonia Eliason",
                "partyId": "2",
              },
              "score": 0,
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 31,
                  "x": 451,
                  "y": 1021,
                },
                "inner": Object {
                  "height": 17,
                  "width": 27,
                  "x": 453,
                  "y": 1023,
                },
              },
              "type": "candidate",
            },
            Object {
              "bounds": Object {
                "height": 21,
                "width": 31,
                "x": 451,
                "y": 1096,
              },
              "contest": Object {
                "allowWriteIns": true,
                "candidates": Array [
                  Object {
                    "id": "31",
                    "name": "Antonia Eliason",
                    "partyId": "2",
                  },
                  Object {
                    "id": "32",
                    "name": "Trent Kelly",
                    "partyId": "3",
                  },
                ],
                "districtId": "100000275",
                "id": "3",
                "seats": 1,
                "section": "United States",
                "title": "United States US House of Representatives 1st Congressional District",
                "type": "candidate",
              },
              "option": Object {
                "id": "32",
                "name": "Trent Kelly",
                "partyId": "3",
              },
              "score": 0.7099447513812155,
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 31,
                  "x": 451,
                  "y": 1096,
                },
                "inner": Object {
                  "height": 17,
                  "width": 27,
                  "x": 453,
                  "y": 1098,
                },
              },
              "type": "candidate",
            },
            Object {
              "bounds": Object {
                "height": 21,
                "width": 31,
                "x": 451,
                "y": 1171,
              },
              "contest": Object {
                "allowWriteIns": true,
                "candidates": Array [
                  Object {
                    "id": "31",
                    "name": "Antonia Eliason",
                    "partyId": "2",
                  },
                  Object {
                    "id": "32",
                    "name": "Trent Kelly",
                    "partyId": "3",
                  },
                ],
                "districtId": "100000275",
                "id": "3",
                "seats": 1,
                "section": "United States",
                "title": "United States US House of Representatives 1st Congressional District",
                "type": "candidate",
              },
              "option": Object {
                "id": "__write-in-0",
                "isWriteIn": true,
                "name": "Write-In",
              },
              "score": 0,
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 31,
                  "x": 451,
                  "y": 1171,
                },
                "inner": Object {
                  "height": 17,
                  "width": 27,
                  "x": 453,
                  "y": 1173,
                },
              },
              "type": "candidate",
            },
            Object {
              "bounds": Object {
                "height": 20,
                "width": 31,
                "x": 837,
                "y": 198,
              },
              "contest": Object {
                "allowWriteIns": true,
                "candidates": Array [
                  Object {
                    "id": "41",
                    "name": "Josiah Coleman",
                    "partyId": "12",
                  },
                  Object {
                    "id": "42",
                    "name": "Percy L. Lynchard Jr.",
                    "partyId": "12",
                  },
                ],
                "districtId": "100000285",
                "id": "4",
                "seats": 1,
                "section": "State of Mississippi",
                "title": "Supreme Court District 3 (Northern) Position 1",
                "type": "candidate",
              },
              "option": Object {
                "id": "41",
                "name": "Josiah Coleman",
                "partyId": "12",
              },
              "score": 0,
              "target": Object {
                "bounds": Object {
                  "height": 20,
                  "width": 31,
                  "x": 837,
                  "y": 198,
                },
                "inner": Object {
                  "height": 16,
                  "width": 27,
                  "x": 839,
                  "y": 200,
                },
              },
              "type": "candidate",
            },
            Object {
              "bounds": Object {
                "height": 20,
                "width": 31,
                "x": 837,
                "y": 285,
              },
              "contest": Object {
                "allowWriteIns": true,
                "candidates": Array [
                  Object {
                    "id": "41",
                    "name": "Josiah Coleman",
                    "partyId": "12",
                  },
                  Object {
                    "id": "42",
                    "name": "Percy L. Lynchard Jr.",
                    "partyId": "12",
                  },
                ],
                "districtId": "100000285",
                "id": "4",
                "seats": 1,
                "section": "State of Mississippi",
                "title": "Supreme Court District 3 (Northern) Position 1",
                "type": "candidate",
              },
              "option": Object {
                "id": "42",
                "name": "Percy L. Lynchard Jr.",
                "partyId": "12",
              },
              "score": 0,
              "target": Object {
                "bounds": Object {
                  "height": 20,
                  "width": 31,
                  "x": 837,
                  "y": 285,
                },
                "inner": Object {
                  "height": 16,
                  "width": 27,
                  "x": 839,
                  "y": 287,
                },
              },
              "type": "candidate",
            },
            Object {
              "bounds": Object {
                "height": 20,
                "width": 31,
                "x": 837,
                "y": 360,
              },
              "contest": Object {
                "allowWriteIns": true,
                "candidates": Array [
                  Object {
                    "id": "41",
                    "name": "Josiah Coleman",
                    "partyId": "12",
                  },
                  Object {
                    "id": "42",
                    "name": "Percy L. Lynchard Jr.",
                    "partyId": "12",
                  },
                ],
                "districtId": "100000285",
                "id": "4",
                "seats": 1,
                "section": "State of Mississippi",
                "title": "Supreme Court District 3 (Northern) Position 1",
                "type": "candidate",
              },
              "option": Object {
                "id": "__write-in-0",
                "isWriteIn": true,
                "name": "Write-In",
              },
              "score": 0.576271186440678,
              "target": Object {
                "bounds": Object {
                  "height": 20,
                  "width": 31,
                  "x": 837,
                  "y": 360,
                },
                "inner": Object {
                  "height": 16,
                  "width": 27,
                  "x": 839,
                  "y": 362,
                },
              },
              "type": "candidate",
            },
            Object {
              "bounds": Object {
                "height": 20,
                "width": 31,
                "x": 837,
                "y": 705,
              },
              "contest": Object {
                "description": "Should Mississippi allow qualified patients with debilitating medical conditions, as certified by Mississippi licensed physicians, to use medical marijuana?",
                "districtId": "100000275",
                "id": "initiative-65",
                "section": "State of Mississippi",
                "shortTitle": "Initiative 65",
                "title": "Medical Marijuana Amendment - Initiative 65",
                "type": "yesno",
              },
              "option": "yes",
              "score": 0.4265536723163842,
              "target": Object {
                "bounds": Object {
                  "height": 20,
                  "width": 31,
                  "x": 837,
                  "y": 705,
                },
                "inner": Object {
                  "height": 16,
                  "width": 27,
                  "x": 839,
                  "y": 707,
                },
              },
              "type": "yesno",
            },
            Object {
              "bounds": Object {
                "height": 20,
                "width": 31,
                "x": 837,
                "y": 753,
              },
              "contest": Object {
                "description": "Should Mississippi allow qualified patients with debilitating medical conditions, as certified by Mississippi licensed physicians, to use medical marijuana?",
                "districtId": "100000275",
                "id": "initiative-65",
                "section": "State of Mississippi",
                "shortTitle": "Initiative 65",
                "title": "Medical Marijuana Amendment - Initiative 65",
                "type": "yesno",
              },
              "option": "no",
              "score": 0.2796610169491525,
              "target": Object {
                "bounds": Object {
                  "height": 20,
                  "width": 31,
                  "x": 837,
                  "y": 753,
                },
                "inner": Object {
                  "height": 16,
                  "width": 27,
                  "x": 839,
                  "y": 755,
                },
              },
              "type": "yesno",
            },
            Object {
              "bounds": Object {
                "height": 20,
                "width": 31,
                "x": 837,
                "y": 1080,
              },
              "contest": Object {
                "description": "Shall Mississippi establish a program to allow the medical use of marijuana products by qualified persons with debilitating medical conditions?",
                "districtId": "100000275",
                "id": "initiative-65-a",
                "section": "State of Mississippi",
                "shortTitle": "Initiative 65A",
                "title": "Medical Marijuana Amendment - Initiative 65A",
                "type": "yesno",
              },
              "option": "yes",
              "score": 0.2457627118644068,
              "target": Object {
                "bounds": Object {
                  "height": 20,
                  "width": 31,
                  "x": 837,
                  "y": 1080,
                },
                "inner": Object {
                  "height": 16,
                  "width": 27,
                  "x": 839,
                  "y": 1082,
                },
              },
              "type": "yesno",
            },
            Object {
              "bounds": Object {
                "height": 20,
                "width": 31,
                "x": 837,
                "y": 1128,
              },
              "contest": Object {
                "description": "Shall Mississippi establish a program to allow the medical use of marijuana products by qualified persons with debilitating medical conditions?",
                "districtId": "100000275",
                "id": "initiative-65-a",
                "section": "State of Mississippi",
                "shortTitle": "Initiative 65A",
                "title": "Medical Marijuana Amendment - Initiative 65A",
                "type": "yesno",
              },
              "option": "no",
              "score": 0,
              "target": Object {
                "bounds": Object {
                  "height": 20,
                  "width": 31,
                  "x": 837,
                  "y": 1128,
                },
                "inner": Object {
                  "height": 16,
                  "width": 27,
                  "x": 839,
                  "y": 1130,
                },
              },
              "type": "yesno",
            },
          ],
        },
        "metadata": Object {
          "ballotStyleId": "1",
          "ballotType": 0,
          "electionHash": "",
          "isTestMode": false,
          "locales": Object {
            "primary": "en-US",
          },
          "pageNumber": 1,
          "precinctId": "6526",
        },
        "type": "InterpretedHmpbPage",
        "votes": Object {
          "1": Array [
            Object {
              "id": "1",
              "name": "Joe Biden",
              "partyId": "2",
            },
          ],
          "2": Array [
            Object {
              "id": "23",
              "name": "Jimmy Edwards",
              "partyId": "4",
            },
          ],
          "3": Array [
            Object {
              "id": "32",
              "name": "Trent Kelly",
              "partyId": "3",
            },
          ],
          "4": Array [
            Object {
              "id": "__write-in-0",
              "isWriteIn": true,
              "name": "Write-In",
            },
          ],
          "initiative-65": Array [
            "yes",
            "no",
          ],
          "initiative-65-a": Array [
            "yes",
          ],
        },
      }
    `)
  }

  {
    const ballotImagePath = join(choctaw2020FixturesRoot, 'filled-in-p2.png')
    expect(
      (
        await interpreter.interpretFile({
          election: {
            markThresholds: DefaultMarkThresholds,
            ...choctaw2020Election,
          },
          ballotImagePath,
          ballotImageFile: await readFile(ballotImagePath),
        })
      ).interpretation
    ).toMatchInlineSnapshot(`
      Object {
        "adjudicationInfo": Object {
          "allReasonInfos": Array [],
          "enabledReasons": Array [
            "UninterpretableBallot",
            "MarginalMark",
          ],
          "requiresAdjudication": false,
        },
        "markInfo": Object {
          "ballotSize": Object {
            "height": 1584,
            "width": 1224,
          },
          "marks": Array [
            Object {
              "bounds": Object {
                "height": 20,
                "width": 31,
                "x": 64,
                "y": 501,
              },
              "contest": Object {
                "description": "Shall the State of Mississippi adopt the following proposed state flag to replace the current state flag? 

       <svg xmlns=\\"http://www.w3.org/2000/svg\\" xmlns:xlink=\\"http://www.w3.org/1999/xlink\\" viewBox=\\"0 0 625 375\\"><path fill=\\"#fff\\" d=\\"M0 0v375h625V0z\\"/><path fill=\\"#012369\\" d=\\"M243 243H0V0h243z\\"/><path fill=\\"#bc0a29\\" d=\\"M0 250h625v125H0z\\"/><path fill=\\"#012369\\" d=\\"M625 0v125H250V0z\\"/><path id=\\"a\\" fill=\\"#fff\\" d=\\"M121.499 57.502l3.407 10.716 11.092-.021-8.986 6.602 3.448 10.702-8.961-6.635-8.961 6.635 3.448-10.702L107 68.197l11.091.021z\\"/><use transform=\\"translate(43.298 26.307)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(43.299 76.301)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(0 101.305)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(-43.296 76.301)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(-43.297 26.308)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(-74.06 0.186)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(-89.326 40.456)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(-84.155 83.219)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(-59.667 118.656)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(-21.539 138.691)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(21.54 138.69)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(59.669 118.656)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(84.157 83.219)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(89.327 40.458)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(74.062 0.186)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(41.823 -28.386)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(0 -40)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(-41.822 -29.688)\\" xlink:href=\\"#a\\"/><use transform=\\"scale(1.65) translate(-47.9 2.904)\\" xlink:href=\\"#a\\"/></svg>",
                "districtId": "100000275",
                "id": "flag-question",
                "section": "State of Mississippi",
                "shortTitle": "Mississippi State Flag Referendum",
                "title": "Mississippi State Flag Referendum",
                "type": "yesno",
              },
              "option": "yes",
              "score": 0.4289772727272727,
              "target": Object {
                "bounds": Object {
                  "height": 20,
                  "width": 31,
                  "x": 64,
                  "y": 501,
                },
                "inner": Object {
                  "height": 16,
                  "width": 27,
                  "x": 66,
                  "y": 503,
                },
              },
              "type": "yesno",
            },
            Object {
              "bounds": Object {
                "height": 20,
                "width": 31,
                "x": 64,
                "y": 549,
              },
              "contest": Object {
                "description": "Shall the State of Mississippi adopt the following proposed state flag to replace the current state flag? 

       <svg xmlns=\\"http://www.w3.org/2000/svg\\" xmlns:xlink=\\"http://www.w3.org/1999/xlink\\" viewBox=\\"0 0 625 375\\"><path fill=\\"#fff\\" d=\\"M0 0v375h625V0z\\"/><path fill=\\"#012369\\" d=\\"M243 243H0V0h243z\\"/><path fill=\\"#bc0a29\\" d=\\"M0 250h625v125H0z\\"/><path fill=\\"#012369\\" d=\\"M625 0v125H250V0z\\"/><path id=\\"a\\" fill=\\"#fff\\" d=\\"M121.499 57.502l3.407 10.716 11.092-.021-8.986 6.602 3.448 10.702-8.961-6.635-8.961 6.635 3.448-10.702L107 68.197l11.091.021z\\"/><use transform=\\"translate(43.298 26.307)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(43.299 76.301)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(0 101.305)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(-43.296 76.301)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(-43.297 26.308)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(-74.06 0.186)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(-89.326 40.456)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(-84.155 83.219)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(-59.667 118.656)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(-21.539 138.691)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(21.54 138.69)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(59.669 118.656)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(84.157 83.219)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(89.327 40.458)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(74.062 0.186)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(41.823 -28.386)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(0 -40)\\" xlink:href=\\"#a\\"/><use transform=\\"translate(-41.822 -29.688)\\" xlink:href=\\"#a\\"/><use transform=\\"scale(1.65) translate(-47.9 2.904)\\" xlink:href=\\"#a\\"/></svg>",
                "districtId": "100000275",
                "id": "flag-question",
                "section": "State of Mississippi",
                "shortTitle": "Mississippi State Flag Referendum",
                "title": "Mississippi State Flag Referendum",
                "type": "yesno",
              },
              "option": "no",
              "score": 0,
              "target": Object {
                "bounds": Object {
                  "height": 20,
                  "width": 31,
                  "x": 64,
                  "y": 549,
                },
                "inner": Object {
                  "height": 16,
                  "width": 27,
                  "x": 66,
                  "y": 551,
                },
              },
              "type": "yesno",
            },
            Object {
              "bounds": Object {
                "height": 20,
                "width": 31,
                "x": 451,
                "y": 597,
              },
              "contest": Object {
                "description": "Should the state remove the requirement that a candidate for governor or elected state office receive the most votes in a majority of the state's 122 House of Representatives districts (the electoral vote requirement), remove the role of the Mississippi House of Representatives in choosing a winner if no candidate receives majority approval, and provide that a candidate for governor or state office must receive a majority vote of the people to win and that a runoff election will be held between the two highest vote-getters in the event that no candidate receives a majority vote?",
                "districtId": "100000275",
                "id": "runoffs-question",
                "section": "State of Mississippi",
                "shortTitle": "Remove Electoral Vote Requirement and Establish Runoffs",
                "title": "Remove Electoral Vote Requirement and Establish Runoffs for Gubernatorial and State Office Elections",
                "type": "yesno",
              },
              "option": "yes",
              "score": 0,
              "target": Object {
                "bounds": Object {
                  "height": 20,
                  "width": 31,
                  "x": 451,
                  "y": 597,
                },
                "inner": Object {
                  "height": 16,
                  "width": 27,
                  "x": 453,
                  "y": 599,
                },
              },
              "type": "yesno",
            },
            Object {
              "bounds": Object {
                "height": 20,
                "width": 31,
                "x": 451,
                "y": 645,
              },
              "contest": Object {
                "description": "Should the state remove the requirement that a candidate for governor or elected state office receive the most votes in a majority of the state's 122 House of Representatives districts (the electoral vote requirement), remove the role of the Mississippi House of Representatives in choosing a winner if no candidate receives majority approval, and provide that a candidate for governor or state office must receive a majority vote of the people to win and that a runoff election will be held between the two highest vote-getters in the event that no candidate receives a majority vote?",
                "districtId": "100000275",
                "id": "runoffs-question",
                "section": "State of Mississippi",
                "shortTitle": "Remove Electoral Vote Requirement and Establish Runoffs",
                "title": "Remove Electoral Vote Requirement and Establish Runoffs for Gubernatorial and State Office Elections",
                "type": "yesno",
              },
              "option": "no",
              "score": 0.29829545454545453,
              "target": Object {
                "bounds": Object {
                  "height": 20,
                  "width": 31,
                  "x": 451,
                  "y": 645,
                },
                "inner": Object {
                  "height": 16,
                  "width": 27,
                  "x": 453,
                  "y": 647,
                },
              },
              "type": "yesno",
            },
          ],
        },
        "metadata": Object {
          "ballotStyleId": "1",
          "ballotType": 0,
          "electionHash": "",
          "isTestMode": false,
          "locales": Object {
            "primary": "en-US",
          },
          "pageNumber": 2,
          "precinctId": "6526",
        },
        "type": "InterpretedHmpbPage",
        "votes": Object {
          "flag-question": Array [
            "yes",
          ],
          "runoffs-question": Array [
            "no",
          ],
        },
      }
    `)
  }
})

test('returns metadata if the QR code is readable but the HMPB ballot is not', async () => {
  const interpreter = new SummaryBallotInterpreter()

  interpreter.setTestMode(false)

  for await (const { page, pageNumber } of pdfToImages(
    await readFile(join(stateOfHamiltonFixturesRoot, 'ballot.pdf')),
    { scale: 2 }
  )) {
    await interpreter.addHmpbTemplate(stateOfHamiltonElection, page)

    if (pageNumber === 3) {
      break
    }
  }

  const ballotImagePath = join(
    stateOfHamiltonFixturesRoot,
    'filled-in-dual-language-p3.jpg'
  )
  expect(
    (
      await interpreter.interpretFile({
        election: stateOfHamiltonElection,
        ballotImagePath,
        ballotImageFile: await readFile(ballotImagePath),
      })
    ).interpretation as UninterpretedHmpbPage
  ).toMatchInlineSnapshot(`
    Object {
      "metadata": Object {
        "ballotStyleId": "12",
        "ballotType": 0,
        "electionHash": "",
        "isTestMode": false,
        "locales": Object {
          "primary": "en-US",
          "secondary": "es-US",
        },
        "pageNumber": 3,
        "precinctId": "23",
      },
      "type": "UninterpretedHmpbPage",
    }
  `)
})

const pageInterpretationBoilerplate: InterpretedHmpbPage = {
  type: 'InterpretedHmpbPage',
  metadata: {
    ballotStyleId: '12',
    ballotType: 0,
    electionHash: '',
    isTestMode: false,
    locales: {
      primary: 'en-US',
    },
    pageNumber: 3,
    precinctId: '23',
  },
  markInfo: {
    ballotSize: {
      height: 1584,
      width: 1224,
    },
    marks: [],
  },
  votes: {},
  adjudicationInfo: {
    allReasonInfos: [],
    enabledReasons: [],
    requiresAdjudication: false,
  },
}

test('sheetRequiresAdjudication triggers if front or back requires adjudication', async () => {
  const sideYes: InterpretedHmpbPage = {
    ...pageInterpretationBoilerplate,
    adjudicationInfo: {
      ...pageInterpretationBoilerplate.adjudicationInfo,
      requiresAdjudication: true,
    },
  }

  const sideNo: InterpretedHmpbPage = {
    ...pageInterpretationBoilerplate,
    adjudicationInfo: {
      ...pageInterpretationBoilerplate.adjudicationInfo,
      requiresAdjudication: false,
    },
  }

  expect(sheetRequiresAdjudication([sideYes, sideNo])).toBe(true)
  expect(sheetRequiresAdjudication([sideNo, sideYes])).toBe(true)
  expect(sheetRequiresAdjudication([sideYes, sideYes])).toBe(true)
  expect(sheetRequiresAdjudication([sideNo, sideNo])).toBe(false)
})

test('sheetRequiresAdjudication triggers only if both sides are blank ballot', async () => {
  const sideBlank: InterpretedHmpbPage = {
    ...pageInterpretationBoilerplate,
    adjudicationInfo: {
      requiresAdjudication: true,
      enabledReasons: [
        AdjudicationReason.BlankBallot,
        AdjudicationReason.UninterpretableBallot,
      ],
      allReasonInfos: [{ type: AdjudicationReason.BlankBallot }],
    },
  }

  const sideNotBlank: InterpretedHmpbPage = {
    ...pageInterpretationBoilerplate,
    adjudicationInfo: {
      requiresAdjudication: false,
      enabledReasons: [],
      allReasonInfos: [],
    },
  }

  expect(sheetRequiresAdjudication([sideBlank, sideBlank])).toBe(true)
  expect(sheetRequiresAdjudication([sideBlank, sideNotBlank])).toBe(false)
  expect(sheetRequiresAdjudication([sideNotBlank, sideNotBlank])).toBe(false)
  expect(sheetRequiresAdjudication([sideNotBlank, sideNotBlank])).toBe(false)
})
