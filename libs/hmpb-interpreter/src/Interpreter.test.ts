import { BallotType } from '@votingworks/types'
import { fail } from 'assert'
import * as choctaw2020Special from '../test/fixtures/choctaw-2020-09-22-f30480cc99'
import * as choctaw2020LegalSize from '../test/fixtures/choctaw-county-2020-general-election'
import * as choctawMock2020 from '../test/fixtures/choctaw-county-mock-general-election-choctaw-2020-e87f23ca2c'
import {
  blankPage1,
  blankPage2,
  election,
  filledInPage1,
  filledInPage2,
  partialBorderPage2,
} from '../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library'
import * as hamilton from '../test/fixtures/election-5c6e578acf-state-of-hamilton-2020'
import * as choctaw2020 from '../test/fixtures/election-7c61368c3b-choctaw-general-2020'
import * as choctaw2019 from '../test/fixtures/election-98f5203139-choctaw-general-2019'
import Interpreter from './Interpreter'
import { BallotTargetMark, DetectQRCodeResult } from './types'

test('interpret three-column template with instructions', async () => {
  const interpreter = new Interpreter(election)
  const imageData = await blankPage1.imageData()
  const template = await interpreter.interpretTemplate(imageData)

  expect(template.ballotImage.metadata).toMatchInlineSnapshot(`
    Object {
      "ballotStyleId": "77",
      "ballotType": 0,
      "electionHash": "",
      "isTestMode": false,
      "locales": Object {
        "primary": "en-US",
      },
      "pageNumber": 1,
      "precinctId": "42",
    }
  `)

  expect(template.contests).toMatchInlineSnapshot(`
    Array [
      Object {
        "bounds": Object {
          "height": 600,
          "width": 381,
          "x": 447,
          "y": 45,
        },
        "corners": Array [
          Object {
            "x": 447,
            "y": 45,
          },
          Object {
            "x": 827,
            "y": 45,
          },
          Object {
            "x": 447,
            "y": 644,
          },
          Object {
            "x": 827,
            "y": 644,
          },
        ],
        "options": Array [
          Object {
            "bounds": Object {
              "height": 79,
              "width": 381,
              "x": 447,
              "y": 174,
            },
            "target": Object {
              "bounds": Object {
                "height": 23,
                "width": 33,
                "x": 470,
                "y": 176,
              },
              "inner": Object {
                "height": 19,
                "width": 29,
                "x": 472,
                "y": 178,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 78,
              "width": 381,
              "x": 447,
              "y": 253,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 33,
                "x": 470,
                "y": 255,
              },
              "inner": Object {
                "height": 19,
                "width": 29,
                "x": 472,
                "y": 256,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 78,
              "width": 381,
              "x": 447,
              "y": 331,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 33,
                "x": 470,
                "y": 333,
              },
              "inner": Object {
                "height": 19,
                "width": 29,
                "x": 472,
                "y": 334,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 78,
              "width": 381,
              "x": 447,
              "y": 409,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 33,
                "x": 470,
                "y": 411,
              },
              "inner": Object {
                "height": 18,
                "width": 29,
                "x": 472,
                "y": 413,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 78,
              "width": 381,
              "x": 447,
              "y": 487,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 33,
                "x": 470,
                "y": 489,
              },
              "inner": Object {
                "height": 18,
                "width": 29,
                "x": 472,
                "y": 491,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 78,
              "width": 381,
              "x": 447,
              "y": 565,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 33,
                "x": 470,
                "y": 567,
              },
              "inner": Object {
                "height": 18,
                "width": 29,
                "x": 472,
                "y": 569,
              },
            },
          },
        ],
      },
      Object {
        "bounds": Object {
          "height": 321,
          "width": 381,
          "x": 447,
          "y": 667,
        },
        "corners": Array [
          Object {
            "x": 447,
            "y": 667,
          },
          Object {
            "x": 827,
            "y": 667,
          },
          Object {
            "x": 447,
            "y": 987,
          },
          Object {
            "x": 827,
            "y": 987,
          },
        ],
        "options": Array [
          Object {
            "bounds": Object {
              "height": 78,
              "width": 381,
              "x": 447,
              "y": 829,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 33,
                "x": 470,
                "y": 831,
              },
              "inner": Object {
                "height": 18,
                "width": 29,
                "x": 472,
                "y": 833,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 79,
              "width": 381,
              "x": 447,
              "y": 907,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 33,
                "x": 470,
                "y": 909,
              },
              "inner": Object {
                "height": 19,
                "width": 29,
                "x": 472,
                "y": 911,
              },
            },
          },
        ],
      },
      Object {
        "bounds": Object {
          "height": 319,
          "width": 381,
          "x": 447,
          "y": 1009,
        },
        "corners": Array [
          Object {
            "x": 447,
            "y": 1009,
          },
          Object {
            "x": 827,
            "y": 1009,
          },
          Object {
            "x": 447,
            "y": 1327,
          },
          Object {
            "x": 827,
            "y": 1327,
          },
        ],
        "options": Array [
          Object {
            "bounds": Object {
              "height": 78,
              "width": 381,
              "x": 447,
              "y": 1171,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 33,
                "x": 470,
                "y": 1173,
              },
              "inner": Object {
                "height": 19,
                "width": 29,
                "x": 472,
                "y": 1175,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 77,
              "width": 381,
              "x": 447,
              "y": 1249,
            },
            "target": Object {
              "bounds": Object {
                "height": 23,
                "width": 33,
                "x": 470,
                "y": 1251,
              },
              "inner": Object {
                "height": 19,
                "width": 29,
                "x": 472,
                "y": 1253,
              },
            },
          },
        ],
      },
      Object {
        "bounds": Object {
          "height": 325,
          "width": 380,
          "x": 850,
          "y": 45,
        },
        "corners": Array [
          Object {
            "x": 850,
            "y": 45,
          },
          Object {
            "x": 1229,
            "y": 45,
          },
          Object {
            "x": 850,
            "y": 369,
          },
          Object {
            "x": 1229,
            "y": 369,
          },
        ],
        "options": Array [
          Object {
            "bounds": Object {
              "height": 78,
              "width": 380,
              "x": 850,
              "y": 240,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 33,
                "x": 872,
                "y": 242,
              },
              "inner": Object {
                "height": 18,
                "width": 29,
                "x": 874,
                "y": 244,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 50,
              "width": 380,
              "x": 850,
              "y": 318,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 33,
                "x": 872,
                "y": 320,
              },
              "inner": Object {
                "height": 19,
                "width": 29,
                "x": 874,
                "y": 322,
              },
            },
          },
        ],
      },
      Object {
        "bounds": Object {
          "height": 292,
          "width": 380,
          "x": 850,
          "y": 392,
        },
        "corners": Array [
          Object {
            "x": 850,
            "y": 392,
          },
          Object {
            "x": 1229,
            "y": 392,
          },
          Object {
            "x": 850,
            "y": 683,
          },
          Object {
            "x": 1229,
            "y": 683,
          },
        ],
        "options": Array [
          Object {
            "bounds": Object {
              "height": 78,
              "width": 380,
              "x": 850,
              "y": 554,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 33,
                "x": 872,
                "y": 556,
              },
              "inner": Object {
                "height": 18,
                "width": 29,
                "x": 874,
                "y": 558,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 50,
              "width": 380,
              "x": 850,
              "y": 632,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 33,
                "x": 872,
                "y": 634,
              },
              "inner": Object {
                "height": 19,
                "width": 29,
                "x": 874,
                "y": 636,
              },
            },
          },
        ],
      },
      Object {
        "bounds": Object {
          "height": 336,
          "width": 380,
          "x": 850,
          "y": 706,
        },
        "corners": Array [
          Object {
            "x": 850,
            "y": 706,
          },
          Object {
            "x": 1229,
            "y": 706,
          },
          Object {
            "x": 850,
            "y": 1041,
          },
          Object {
            "x": 1229,
            "y": 1041,
          },
        ],
        "options": Array [
          Object {
            "bounds": Object {
              "height": 79,
              "width": 380,
              "x": 850,
              "y": 835,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 33,
                "x": 872,
                "y": 837,
              },
              "inner": Object {
                "height": 19,
                "width": 29,
                "x": 874,
                "y": 839,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 78,
              "width": 380,
              "x": 850,
              "y": 914,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 33,
                "x": 872,
                "y": 916,
              },
              "inner": Object {
                "height": 19,
                "width": 29,
                "x": 874,
                "y": 917,
              },
            },
          },
          Object {
            "bounds": Object {
              "height": 48,
              "width": 380,
              "x": 850,
              "y": 993,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 33,
                "x": 872,
                "y": 994,
              },
              "inner": Object {
                "height": 19,
                "width": 29,
                "x": 874,
                "y": 995,
              },
            },
          },
        ],
      },
    ]
  `)
})

test('interpret two-column template', async () => {
  const interpreter = new Interpreter(choctawMock2020.election)

  {
    const imageData = await choctawMock2020.blankPage1.imageData()
    const template = await interpreter.addTemplate(imageData)

    expect(template.ballotImage.metadata).toMatchInlineSnapshot(`
      Object {
        "ballotId": undefined,
        "ballotStyleId": "1",
        "ballotType": 0,
        "electionHash": "e87f23ca2cc9feed24cf252920cecd26f1777746c634ea78debd1dc50e48a762",
        "isTestMode": false,
        "locales": Object {
          "primary": "en-US",
          "secondary": undefined,
        },
        "pageNumber": 1,
        "precinctId": "6525",
      }
    `)

    expect(template.contests).toMatchInlineSnapshot(`
      Array [
        Object {
          "bounds": Object {
            "height": 683,
            "width": 381,
            "x": 447,
            "y": 45,
          },
          "corners": Array [
            Object {
              "x": 447,
              "y": 45,
            },
            Object {
              "x": 827,
              "y": 45,
            },
            Object {
              "x": 447,
              "y": 727,
            },
            Object {
              "x": 827,
              "y": 727,
            },
          ],
          "options": Array [
            Object {
              "bounds": Object {
                "height": 163,
                "width": 381,
                "x": 447,
                "y": 168,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 470,
                  "y": 173,
                },
                "inner": Object {
                  "height": 19,
                  "width": 29,
                  "x": 472,
                  "y": 175,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 162,
                "width": 381,
                "x": 447,
                "y": 331,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 470,
                  "y": 336,
                },
                "inner": Object {
                  "height": 18,
                  "width": 29,
                  "x": 472,
                  "y": 338,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 163,
                "width": 381,
                "x": 447,
                "y": 493,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 470,
                  "y": 498,
                },
                "inner": Object {
                  "height": 19,
                  "width": 29,
                  "x": 472,
                  "y": 500,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 67,
                "width": 381,
                "x": 447,
                "y": 659,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 470,
                  "y": 661,
                },
                "inner": Object {
                  "height": 18,
                  "width": 29,
                  "x": 472,
                  "y": 663,
                },
              },
            },
          ],
        },
        Object {
          "bounds": Object {
            "height": 430,
            "width": 381,
            "x": 447,
            "y": 750,
          },
          "corners": Array [
            Object {
              "x": 447,
              "y": 750,
            },
            Object {
              "x": 827,
              "y": 750,
            },
            Object {
              "x": 447,
              "y": 1179,
            },
            Object {
              "x": 827,
              "y": 1179,
            },
          ],
          "options": Array [
            Object {
              "bounds": Object {
                "height": 78,
                "width": 381,
                "x": 447,
                "y": 876,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 470,
                  "y": 878,
                },
                "inner": Object {
                  "height": 18,
                  "width": 29,
                  "x": 472,
                  "y": 880,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 78,
                "width": 381,
                "x": 447,
                "y": 954,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 470,
                  "y": 956,
                },
                "inner": Object {
                  "height": 18,
                  "width": 29,
                  "x": 472,
                  "y": 958,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 78,
                "width": 381,
                "x": 447,
                "y": 1032,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 470,
                  "y": 1034,
                },
                "inner": Object {
                  "height": 19,
                  "width": 29,
                  "x": 472,
                  "y": 1036,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 68,
                "width": 381,
                "x": 447,
                "y": 1110,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 470,
                  "y": 1112,
                },
                "inner": Object {
                  "height": 19,
                  "width": 29,
                  "x": 472,
                  "y": 1114,
                },
              },
            },
          ],
        },
        Object {
          "bounds": Object {
            "height": 352,
            "width": 380,
            "x": 850,
            "y": 45,
          },
          "corners": Array [
            Object {
              "x": 850,
              "y": 45,
            },
            Object {
              "x": 1229,
              "y": 45,
            },
            Object {
              "x": 850,
              "y": 396,
            },
            Object {
              "x": 1229,
              "y": 396,
            },
          ],
          "options": Array [
            Object {
              "bounds": Object {
                "height": 78,
                "width": 380,
                "x": 850,
                "y": 171,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 873,
                  "y": 173,
                },
                "inner": Object {
                  "height": 19,
                  "width": 30,
                  "x": 875,
                  "y": 175,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 79,
                "width": 380,
                "x": 850,
                "y": 249,
              },
              "target": Object {
                "bounds": Object {
                  "height": 23,
                  "width": 33,
                  "x": 873,
                  "y": 251,
                },
                "inner": Object {
                  "height": 19,
                  "width": 30,
                  "x": 875,
                  "y": 253,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 67,
                "width": 380,
                "x": 850,
                "y": 328,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 873,
                  "y": 330,
                },
                "inner": Object {
                  "height": 19,
                  "width": 30,
                  "x": 875,
                  "y": 331,
                },
              },
            },
          ],
        },
        Object {
          "bounds": Object {
            "height": 384,
            "width": 380,
            "x": 850,
            "y": 419,
          },
          "corners": Array [
            Object {
              "x": 850,
              "y": 419,
            },
            Object {
              "x": 1229,
              "y": 419,
            },
            Object {
              "x": 850,
              "y": 802,
            },
            Object {
              "x": 1229,
              "y": 802,
            },
          ],
          "options": Array [
            Object {
              "bounds": Object {
                "height": 78,
                "width": 380,
                "x": 850,
                "y": 578,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 873,
                  "y": 580,
                },
                "inner": Object {
                  "height": 19,
                  "width": 30,
                  "x": 875,
                  "y": 581,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 78,
                "width": 380,
                "x": 850,
                "y": 656,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 873,
                  "y": 658,
                },
                "inner": Object {
                  "height": 19,
                  "width": 30,
                  "x": 875,
                  "y": 659,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 67,
                "width": 380,
                "x": 850,
                "y": 734,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 873,
                  "y": 736,
                },
                "inner": Object {
                  "height": 18,
                  "width": 30,
                  "x": 875,
                  "y": 738,
                },
              },
            },
          ],
        },
        Object {
          "bounds": Object {
            "height": 294,
            "width": 380,
            "x": 850,
            "y": 825,
          },
          "corners": Array [
            Object {
              "x": 850,
              "y": 825,
            },
            Object {
              "x": 1229,
              "y": 825,
            },
            Object {
              "x": 850,
              "y": 1118,
            },
            Object {
              "x": 1229,
              "y": 1118,
            },
          ],
          "options": Array [
            Object {
              "bounds": Object {
                "height": 50,
                "width": 380,
                "x": 850,
                "y": 951,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 873,
                  "y": 953,
                },
                "inner": Object {
                  "height": 18,
                  "width": 30,
                  "x": 875,
                  "y": 955,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 50,
                "width": 380,
                "x": 850,
                "y": 1001,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 873,
                  "y": 1003,
                },
                "inner": Object {
                  "height": 18,
                  "width": 30,
                  "x": 875,
                  "y": 1005,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 66,
                "width": 380,
                "x": 850,
                "y": 1051,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 873,
                  "y": 1053,
                },
                "inner": Object {
                  "height": 18,
                  "width": 30,
                  "x": 875,
                  "y": 1055,
                },
              },
            },
          ],
        },
      ]
    `)
  }

  {
    const imageData = await choctawMock2020.blankPage2.imageData()
    const template = await interpreter.addTemplate(imageData)

    expect(template.ballotImage.metadata).toMatchInlineSnapshot(`
          Object {
            "ballotId": undefined,
            "ballotStyleId": "1",
            "ballotType": 0,
            "electionHash": "e87f23ca2cc9feed24cf252920cecd26f1777746c634ea78debd1dc50e48a762",
            "isTestMode": false,
            "locales": Object {
              "primary": "en-US",
              "secondary": undefined,
            },
            "pageNumber": 2,
            "precinctId": "6525",
          }
      `)

    expect(template.contests).toMatchInlineSnapshot(`
      Array [
        Object {
          "bounds": Object {
            "height": 1144,
            "width": 582,
            "x": 45,
            "y": 45,
          },
          "corners": Array [
            Object {
              "x": 45,
              "y": 45,
            },
            Object {
              "x": 626,
              "y": 45,
            },
            Object {
              "x": 45,
              "y": 1188,
            },
            Object {
              "x": 626,
              "y": 1188,
            },
          ],
          "options": Array [
            Object {
              "bounds": Object {
                "height": 78,
                "width": 582,
                "x": 45,
                "y": 882,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 69,
                  "y": 884,
                },
                "inner": Object {
                  "height": 19,
                  "width": 30,
                  "x": 70,
                  "y": 886,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 129,
                "width": 582,
                "x": 45,
                "y": 958,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 69,
                  "y": 962,
                },
                "inner": Object {
                  "height": 19,
                  "width": 30,
                  "x": 70,
                  "y": 964,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 50,
                "width": 582,
                "x": 45,
                "y": 1089,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 69,
                  "y": 1091,
                },
                "inner": Object {
                  "height": 19,
                  "width": 30,
                  "x": 70,
                  "y": 1092,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 48,
                "width": 582,
                "x": 45,
                "y": 1140,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 69,
                  "y": 1141,
                },
                "inner": Object {
                  "height": 19,
                  "width": 30,
                  "x": 70,
                  "y": 1142,
                },
              },
            },
          ],
        },
        Object {
          "bounds": Object {
            "height": 413,
            "width": 582,
            "x": 648,
            "y": 45,
          },
          "corners": Array [
            Object {
              "x": 648,
              "y": 45,
            },
            Object {
              "x": 1229,
              "y": 45,
            },
            Object {
              "x": 648,
              "y": 457,
            },
            Object {
              "x": 1229,
              "y": 457,
            },
          ],
          "options": Array [
            Object {
              "bounds": Object {
                "height": 50,
                "width": 582,
                "x": 648,
                "y": 357,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 672,
                  "y": 359,
                },
                "inner": Object {
                  "height": 19,
                  "width": 29,
                  "x": 674,
                  "y": 361,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 49,
                "width": 582,
                "x": 648,
                "y": 408,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 672,
                  "y": 409,
                },
                "inner": Object {
                  "height": 19,
                  "width": 29,
                  "x": 674,
                  "y": 411,
                },
              },
            },
          ],
        },
        Object {
          "bounds": Object {
            "height": 625,
            "width": 582,
            "x": 648,
            "y": 480,
          },
          "corners": Array [
            Object {
              "x": 648,
              "y": 480,
            },
            Object {
              "x": 1229,
              "y": 480,
            },
            Object {
              "x": 648,
              "y": 1104,
            },
            Object {
              "x": 1229,
              "y": 1104,
            },
          ],
          "options": Array [
            Object {
              "bounds": Object {
                "height": 50,
                "width": 582,
                "x": 648,
                "y": 1004,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 672,
                  "y": 1006,
                },
                "inner": Object {
                  "height": 18,
                  "width": 29,
                  "x": 674,
                  "y": 1008,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 49,
                "width": 582,
                "x": 648,
                "y": 1055,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 33,
                  "x": 672,
                  "y": 1056,
                },
                "inner": Object {
                  "height": 18,
                  "width": 29,
                  "x": 674,
                  "y": 1058,
                },
              },
            },
          ],
        },
      ]
    `)
  }

  {
    const {
      ballot: { votes },
    } = await interpreter.interpretBallot(
      await choctawMock2020.filledInPage1.imageData()
    )
    expect(votes).toMatchInlineSnapshot(`
      Object {
        "775020870": Array [
          Object {
            "id": "__write-in-0",
            "isWriteIn": true,
            "name": "Write-In",
          },
        ],
        "775020872": Array [
          Object {
            "id": "775031979",
            "name": "Trent Kelly",
            "partyId": "3",
          },
        ],
        "775020876": Array [
          Object {
            "id": "775031989",
            "name": "Presidential Electors for Phil Collins for President and Bill Parker for Vice President",
            "partyId": "11",
          },
        ],
        "775020877": Array [
          Object {
            "id": "775031985",
            "name": "Mike Espy",
            "partyId": "2",
          },
        ],
        "775020902": Array [
          Object {
            "id": "775032019",
            "name": "Willie Mae Guillory",
          },
        ],
      }
    `)
  }

  {
    const {
      ballot: { votes },
    } = await interpreter.interpretBallot(
      await choctawMock2020.filledInPage2.imageData()
    )
    expect(votes).toMatchInlineSnapshot(`
      Object {
        "750000015": Array [
          "yes",
        ],
        "750000016": Array [
          "yes",
        ],
        "750000017": Array [
          "no",
        ],
        "750000018": Array [
          "no",
        ],
      }
    `)
  }
})

test('interpret empty ballot', async () => {
  const interpreter = new Interpreter(election)

  await expect(
    interpreter.interpretBallot(await blankPage1.imageData())
  ).rejects.toThrow(
    'Cannot scan ballot because not all required templates have been added'
  )
  const p1 = await interpreter.addTemplate(await blankPage1.imageData())
  await interpreter.addTemplate(await blankPage2.imageData())

  const {
    matchedTemplate,
    mappedBallot,
    metadata,
    ballot,
  } = await interpreter.interpretBallot(await blankPage1.imageData())
  expect(matchedTemplate === p1).toBe(true)
  expect(mappedBallot.width).toBe(matchedTemplate.ballotImage.imageData.width)
  expect(mappedBallot.height).toBe(matchedTemplate.ballotImage.imageData.height)
  expect(metadata.ballotStyleId).toEqual(p1.ballotImage.metadata.ballotStyleId)
  expect(ballot.votes).toEqual({})
})

test('interpret votes', async () => {
  const interpreter = new Interpreter(election)

  await interpreter.addTemplate(await blankPage1.imageData())

  const { ballot, marks } = await interpreter.interpretBallot(
    await filledInPage1.imageData()
  )
  expect(ballot.votes).toMatchInlineSnapshot(`
    Object {
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
          "name": "John Ames",
          "partyId": "2",
        },
      ],
      "texas-house-district-111": Array [
        Object {
          "id": "__write-in-0",
          "isWriteIn": true,
          "name": "Write-In",
        },
      ],
      "texas-sc-judge-place-6": Array [
        Object {
          "id": "jane-bland",
          "name": "Jane Bland",
          "partyId": "3",
        },
      ],
      "us-house-district-30": Array [
        Object {
          "id": "eddie-bernice-johnson",
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
        "score": 0.8765432098765432,
        "type": "candidate",
      },
      Object {
        "option": "Arjun Srinivasan",
        "score": 0.0024630541871921183,
        "type": "candidate",
      },
      Object {
        "option": "Ricardo Turullols-Bonilla",
        "score": 0.007407407407407408,
        "type": "candidate",
      },
      Object {
        "option": "Eddie Bernice Johnson",
        "score": 0.7832512315270936,
        "type": "candidate",
      },
      Object {
        "option": "Tre Pennie",
        "score": 0.0024449877750611247,
        "type": "candidate",
      },
      Object {
        "option": "Jane Bland",
        "score": 0.7524509803921569,
        "type": "candidate",
      },
      Object {
        "option": "Kathy Cheng",
        "score": 0.004889975550122249,
        "type": "candidate",
      },
      Object {
        "option": "Yvonne Davis",
        "score": 0,
        "type": "candidate",
      },
      Object {
        "option": "Write-In",
        "score": 0.8029556650246306,
        "type": "candidate",
      },
      Object {
        "option": "John Ames",
        "score": 0.8866995073891626,
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
        "score": 0.7,
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
    await blankPage1.imageData(),
    await blankPage1.metadata()
  )
  await interpreter.addTemplate(
    await blankPage2.imageData(),
    await blankPage2.metadata()
  )

  const { ballot, marks } = await interpreter.interpretBallot(
    await filledInPage2.imageData(),
    await filledInPage2.metadata()
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
          "id": "donald-davis",
          "name": "Donald Davis",
          "partyId": "3",
        },
        Object {
          "id": "__write-in-1",
          "isWriteIn": true,
          "name": "Write-In",
        },
      ],
      "dallas-county-commissioners-court-pct-3": Array [
        Object {
          "id": "andrew-jewell",
          "name": "Andrew Jewell",
          "partyId": "7",
        },
      ],
      "dallas-county-proposition-r": Array [
        "no",
      ],
      "dallas-county-retain-chief-justice": Array [
        "yes",
      ],
    }
  `)

  expect(marks).toMatchInlineSnapshot(`
    Array [
      Object {
        "bounds": Object {
          "height": 22,
          "width": 33,
          "x": 67,
          "y": 242,
        },
        "contest": Object {
          "allowWriteIns": true,
          "candidates": Array [
            Object {
              "id": "john-wiley-price",
              "name": "John Wiley Price",
              "partyId": "2",
            },
            Object {
              "id": "s-t-russell",
              "name": "S.T. Russell",
              "partyId": "3",
            },
            Object {
              "id": "andrew-jewell",
              "name": "Andrew Jewell",
              "partyId": "7",
            },
          ],
          "districtId": "12",
          "id": "dallas-county-commissioners-court-pct-3",
          "seats": 2,
          "section": "Dallas County",
          "title": "Member, Dallas County Commissioners Court, Precinct 3",
          "type": "candidate",
        },
        "option": Object {
          "id": "john-wiley-price",
          "name": "John Wiley Price",
          "partyId": "2",
        },
        "score": 0.009950248756218905,
        "scoredOffset": Object {
          "x": 0,
          "y": 1,
        },
        "target": Object {
          "bounds": Object {
            "height": 22,
            "width": 33,
            "x": 67,
            "y": 242,
          },
          "inner": Object {
            "height": 18,
            "width": 29,
            "x": 69,
            "y": 244,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 22,
          "width": 33,
          "x": 67,
          "y": 320,
        },
        "contest": Object {
          "allowWriteIns": true,
          "candidates": Array [
            Object {
              "id": "john-wiley-price",
              "name": "John Wiley Price",
              "partyId": "2",
            },
            Object {
              "id": "s-t-russell",
              "name": "S.T. Russell",
              "partyId": "3",
            },
            Object {
              "id": "andrew-jewell",
              "name": "Andrew Jewell",
              "partyId": "7",
            },
          ],
          "districtId": "12",
          "id": "dallas-county-commissioners-court-pct-3",
          "seats": 2,
          "section": "Dallas County",
          "title": "Member, Dallas County Commissioners Court, Precinct 3",
          "type": "candidate",
        },
        "option": Object {
          "id": "s-t-russell",
          "name": "S.T. Russell",
          "partyId": "3",
        },
        "score": 0,
        "scoredOffset": Object {
          "x": 0,
          "y": 0,
        },
        "target": Object {
          "bounds": Object {
            "height": 22,
            "width": 33,
            "x": 67,
            "y": 320,
          },
          "inner": Object {
            "height": 19,
            "width": 29,
            "x": 69,
            "y": 322,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 22,
          "width": 33,
          "x": 67,
          "y": 398,
        },
        "contest": Object {
          "allowWriteIns": true,
          "candidates": Array [
            Object {
              "id": "john-wiley-price",
              "name": "John Wiley Price",
              "partyId": "2",
            },
            Object {
              "id": "s-t-russell",
              "name": "S.T. Russell",
              "partyId": "3",
            },
            Object {
              "id": "andrew-jewell",
              "name": "Andrew Jewell",
              "partyId": "7",
            },
          ],
          "districtId": "12",
          "id": "dallas-county-commissioners-court-pct-3",
          "seats": 2,
          "section": "Dallas County",
          "title": "Member, Dallas County Commissioners Court, Precinct 3",
          "type": "candidate",
        },
        "option": Object {
          "id": "andrew-jewell",
          "name": "Andrew Jewell",
          "partyId": "7",
        },
        "score": 0.8271604938271605,
        "scoredOffset": Object {
          "x": 0,
          "y": 0,
        },
        "target": Object {
          "bounds": Object {
            "height": 22,
            "width": 33,
            "x": 67,
            "y": 398,
          },
          "inner": Object {
            "height": 19,
            "width": 29,
            "x": 69,
            "y": 400,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 23,
          "width": 33,
          "x": 67,
          "y": 476,
        },
        "contest": Object {
          "allowWriteIns": true,
          "candidates": Array [
            Object {
              "id": "john-wiley-price",
              "name": "John Wiley Price",
              "partyId": "2",
            },
            Object {
              "id": "s-t-russell",
              "name": "S.T. Russell",
              "partyId": "3",
            },
            Object {
              "id": "andrew-jewell",
              "name": "Andrew Jewell",
              "partyId": "7",
            },
          ],
          "districtId": "12",
          "id": "dallas-county-commissioners-court-pct-3",
          "seats": 2,
          "section": "Dallas County",
          "title": "Member, Dallas County Commissioners Court, Precinct 3",
          "type": "candidate",
        },
        "option": Object {
          "id": "__write-in-0",
          "isWriteIn": true,
          "name": "Write-In",
        },
        "score": 0,
        "scoredOffset": Object {
          "x": 0,
          "y": 0,
        },
        "target": Object {
          "bounds": Object {
            "height": 23,
            "width": 33,
            "x": 67,
            "y": 476,
          },
          "inner": Object {
            "height": 19,
            "width": 29,
            "x": 69,
            "y": 478,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 23,
          "width": 33,
          "x": 67,
          "y": 526,
        },
        "contest": Object {
          "allowWriteIns": true,
          "candidates": Array [
            Object {
              "id": "john-wiley-price",
              "name": "John Wiley Price",
              "partyId": "2",
            },
            Object {
              "id": "s-t-russell",
              "name": "S.T. Russell",
              "partyId": "3",
            },
            Object {
              "id": "andrew-jewell",
              "name": "Andrew Jewell",
              "partyId": "7",
            },
          ],
          "districtId": "12",
          "id": "dallas-county-commissioners-court-pct-3",
          "seats": 2,
          "section": "Dallas County",
          "title": "Member, Dallas County Commissioners Court, Precinct 3",
          "type": "candidate",
        },
        "option": Object {
          "id": "__write-in-1",
          "isWriteIn": true,
          "name": "Write-In",
        },
        "score": 0,
        "scoredOffset": Object {
          "x": 0,
          "y": 0,
        },
        "target": Object {
          "bounds": Object {
            "height": 23,
            "width": 33,
            "x": 67,
            "y": 526,
          },
          "inner": Object {
            "height": 19,
            "width": 29,
            "x": 69,
            "y": 528,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 22,
          "width": 33,
          "x": 67,
          "y": 869,
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
        "score": 0.18610421836228289,
        "scoredOffset": Object {
          "x": 0,
          "y": 1,
        },
        "target": Object {
          "bounds": Object {
            "height": 22,
            "width": 33,
            "x": 67,
            "y": 869,
          },
          "inner": Object {
            "height": 19,
            "width": 29,
            "x": 69,
            "y": 870,
          },
        },
        "type": "yesno",
      },
      Object {
        "bounds": Object {
          "height": 22,
          "width": 33,
          "x": 67,
          "y": 919,
        },
        "contest": Object {
          "description": "Shall Robert Demergue be retained as Chief Justice of the Dallas County Court of Appeals?",
          "districtId": "12",
          "id": "dallas-county-retain-chief-justice",
          "section": "Dallas County",
          "title": "Retain Robert Demergue as Chief Justice?",
          "type": "yesno",
        },
        "option": "no",
        "score": 0,
        "scoredOffset": Object {
          "x": 0,
          "y": 0,
        },
        "target": Object {
          "bounds": Object {
            "height": 22,
            "width": 33,
            "x": 67,
            "y": 919,
          },
          "inner": Object {
            "height": 19,
            "width": 29,
            "x": 69,
            "y": 920,
          },
        },
        "type": "yesno",
      },
      Object {
        "bounds": Object {
          "height": 23,
          "width": 33,
          "x": 470,
          "y": 315,
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
        "scoredOffset": Object {
          "x": 0,
          "y": 1,
        },
        "target": Object {
          "bounds": Object {
            "height": 23,
            "width": 33,
            "x": 470,
            "y": 315,
          },
          "inner": Object {
            "height": 19,
            "width": 29,
            "x": 472,
            "y": 317,
          },
        },
        "type": "yesno",
      },
      Object {
        "bounds": Object {
          "height": 23,
          "width": 33,
          "x": 470,
          "y": 365,
        },
        "contest": Object {
          "description": "Shall the Dallas County extend the Recycling Program countywide?",
          "districtId": "12",
          "id": "dallas-county-proposition-r",
          "section": "Dallas County",
          "title": "Proposition R: Countywide Recycling Program",
          "type": "yesno",
        },
        "option": "no",
        "score": 0.8215158924205379,
        "scoredOffset": Object {
          "x": -1,
          "y": 1,
        },
        "target": Object {
          "bounds": Object {
            "height": 23,
            "width": 33,
            "x": 470,
            "y": 365,
          },
          "inner": Object {
            "height": 19,
            "width": 29,
            "x": 472,
            "y": 367,
          },
        },
        "type": "yesno",
      },
      Object {
        "bounds": Object {
          "height": 22,
          "width": 33,
          "x": 470,
          "y": 569,
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
        "scoredOffset": Object {
          "x": 0,
          "y": 0,
        },
        "target": Object {
          "bounds": Object {
            "height": 22,
            "width": 33,
            "x": 470,
            "y": 569,
          },
          "inner": Object {
            "height": 19,
            "width": 29,
            "x": 472,
            "y": 570,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 22,
          "width": 33,
          "x": 470,
          "y": 647,
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
        "score": 0.1921182266009852,
        "scoredOffset": Object {
          "x": 0,
          "y": 0,
        },
        "target": Object {
          "bounds": Object {
            "height": 22,
            "width": 33,
            "x": 470,
            "y": 647,
          },
          "inner": Object {
            "height": 18,
            "width": 29,
            "x": 472,
            "y": 649,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 22,
          "width": 33,
          "x": 470,
          "y": 725,
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
        "score": 0.0024752475247524753,
        "scoredOffset": Object {
          "x": -1,
          "y": 0,
        },
        "target": Object {
          "bounds": Object {
            "height": 22,
            "width": 33,
            "x": 470,
            "y": 725,
          },
          "inner": Object {
            "height": 18,
            "width": 29,
            "x": 472,
            "y": 727,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 22,
          "width": 33,
          "x": 470,
          "y": 803,
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
        "score": 0.0024752475247524753,
        "scoredOffset": Object {
          "x": -1,
          "y": 0,
        },
        "target": Object {
          "bounds": Object {
            "height": 22,
            "width": 33,
            "x": 470,
            "y": 803,
          },
          "inner": Object {
            "height": 18,
            "width": 29,
            "x": 472,
            "y": 805,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 22,
          "width": 33,
          "x": 470,
          "y": 881,
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
        "score": 0.19801980198019803,
        "scoredOffset": Object {
          "x": -1,
          "y": 0,
        },
        "target": Object {
          "bounds": Object {
            "height": 22,
            "width": 33,
            "x": 470,
            "y": 881,
          },
          "inner": Object {
            "height": 18,
            "width": 29,
            "x": 472,
            "y": 883,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 22,
          "width": 33,
          "x": 470,
          "y": 959,
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
        "score": 0.009950248756218905,
        "scoredOffset": Object {
          "x": 0,
          "y": 0,
        },
        "target": Object {
          "bounds": Object {
            "height": 22,
            "width": 33,
            "x": 470,
            "y": 959,
          },
          "inner": Object {
            "height": 19,
            "width": 29,
            "x": 472,
            "y": 961,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 23,
          "width": 33,
          "x": 470,
          "y": 1037,
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
          "id": "__write-in-0",
          "isWriteIn": true,
          "name": "Write-In",
        },
        "score": 0,
        "scoredOffset": Object {
          "x": 0,
          "y": 0,
        },
        "target": Object {
          "bounds": Object {
            "height": 23,
            "width": 33,
            "x": 470,
            "y": 1037,
          },
          "inner": Object {
            "height": 19,
            "width": 29,
            "x": 472,
            "y": 1039,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 22,
          "width": 33,
          "x": 470,
          "y": 1087,
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
          "id": "__write-in-1",
          "isWriteIn": true,
          "name": "Write-In",
        },
        "score": 0.15403422982885084,
        "scoredOffset": Object {
          "x": 0,
          "y": -1,
        },
        "target": Object {
          "bounds": Object {
            "height": 22,
            "width": 33,
            "x": 470,
            "y": 1087,
          },
          "inner": Object {
            "height": 19,
            "width": 29,
            "x": 472,
            "y": 1089,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 23,
          "width": 33,
          "x": 470,
          "y": 1137,
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
          "id": "__write-in-2",
          "isWriteIn": true,
          "name": "Write-In",
        },
        "score": 0.007371007371007371,
        "scoredOffset": Object {
          "x": 0,
          "y": 0,
        },
        "target": Object {
          "bounds": Object {
            "height": 23,
            "width": 33,
            "x": 470,
            "y": 1137,
          },
          "inner": Object {
            "height": 19,
            "width": 29,
            "x": 472,
            "y": 1139,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 23,
          "width": 33,
          "x": 872,
          "y": 176,
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
        "scoredOffset": Object {
          "x": 0,
          "y": 1,
        },
        "target": Object {
          "bounds": Object {
            "height": 23,
            "width": 33,
            "x": 872,
            "y": 176,
          },
          "inner": Object {
            "height": 19,
            "width": 29,
            "x": 874,
            "y": 178,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 22,
          "width": 33,
          "x": 872,
          "y": 255,
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
        "scoredOffset": Object {
          "x": 0,
          "y": 1,
        },
        "target": Object {
          "bounds": Object {
            "height": 22,
            "width": 33,
            "x": 872,
            "y": 255,
          },
          "inner": Object {
            "height": 19,
            "width": 29,
            "x": 874,
            "y": 256,
          },
        },
        "type": "candidate",
      },
      Object {
        "bounds": Object {
          "height": 22,
          "width": 33,
          "x": 872,
          "y": 333,
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
          "id": "__write-in-0",
          "isWriteIn": true,
          "name": "Write-In",
        },
        "score": 0.0024691358024691358,
        "scoredOffset": Object {
          "x": 0,
          "y": 1,
        },
        "target": Object {
          "bounds": Object {
            "height": 22,
            "width": 33,
            "x": 872,
            "y": 333,
          },
          "inner": Object {
            "height": 18,
            "width": 29,
            "x": 874,
            "y": 335,
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
      data: Buffer.from('https://ballot.page?t=_&pr=11&bs=22&p=3-4'),
    }),
  })
  const template = await interpreter.interpretTemplate(
    await blankPage1.imageData()
  )

  expect(template.ballotImage.metadata).toEqual({
    locales: { primary: 'en-US' },
    ballotStyleId: '22',
    precinctId: '11',
    isTestMode: false,
    pageNumber: 3,
    electionHash: '',
    ballotType: BallotType.Standard,
  })
})

test('upside-down ballot', async () => {
  const interpreter = new Interpreter(election)

  await interpreter.addTemplate(
    await blankPage1.imageData(),
    await blankPage1.metadata()
  )
  await interpreter.addTemplate(
    await blankPage2.imageData(),
    await blankPage2.metadata()
  )

  const { ballot, metadata } = await interpreter.interpretBallot(
    await filledInPage1.imageData()
  )
  expect(ballot.votes).toMatchInlineSnapshot(`
    Object {
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
          "name": "John Ames",
          "partyId": "2",
        },
      ],
      "texas-house-district-111": Array [
        Object {
          "id": "__write-in-0",
          "isWriteIn": true,
          "name": "Write-In",
        },
      ],
      "texas-sc-judge-place-6": Array [
        Object {
          "id": "jane-bland",
          "name": "Jane Bland",
          "partyId": "3",
        },
      ],
      "us-house-district-30": Array [
        Object {
          "id": "eddie-bernice-johnson",
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

  const {
    ballot: { votes: votesWithFlipped },
  } = await interpreter.interpretBallot(
    await filledInPage1.imageData({ flipped: true }),
    metadata,
    { flipped: true }
  )

  expect(votesWithFlipped).toEqual(ballot.votes)
})

test('enforcing test vs live mode', async () => {
  const interpreter = new Interpreter(election)

  await expect(
    interpreter.addTemplate(
      await blankPage1.imageData(),
      await blankPage1.metadata({ isTestMode: true })
    )
  ).rejects.toThrowError(
    'interpreter configured with testMode=false cannot add templates with isTestMode=true'
  )

  await interpreter.addTemplate(
    await blankPage1.imageData(),
    await blankPage1.metadata()
  )
  await interpreter.addTemplate(
    await blankPage2.imageData(),
    await blankPage2.metadata()
  )

  await expect(
    interpreter.interpretBallot(
      await blankPage1.imageData(),
      await blankPage1.metadata({ isTestMode: true })
    )
  ).rejects.toThrowError(
    'interpreter configured with testMode=false cannot interpret ballots with isTestMode=true'
  )
})

test('can interpret a template that is not in the same mode as the interpreter', async () => {
  const interpreter = new Interpreter({ election, testMode: true })

  expect(
    (
      await interpreter.interpretTemplate(
        await blankPage1.imageData(),
        await blankPage1.metadata({ isTestMode: false })
      )
    ).ballotImage.metadata.isTestMode
  ).toBe(false)
})

test('dual language ballot', async () => {
  const interpreter = new Interpreter({ election: hamilton.election })

  await interpreter.addTemplate(
    await hamilton.blankPage1.imageData(),
    await hamilton.blankPage1.metadata()
  )

  const { ballot } = await interpreter.interpretBallot(
    await hamilton.filledInPage1.imageData()
  )
  expect(ballot.votes).toMatchInlineSnapshot(`
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

/**
 * TODO: Enable this test when contest box identification improves.
 *
 * At the moment we look for contest boxes by finding contiguous dark pixels
 * that are roughly the expected dimensions for a contest. Unfortunately, if
 * someone draws lines connecting boxes then we can't distinguish them.
 */
test.skip('handles lines connecting contest boxes', async () => {
  const interpreter = new Interpreter({ election: hamilton.election })

  await interpreter.addTemplate(
    await hamilton.blankPage1.imageData(),
    await hamilton.blankPage1.metadata()
  )
  await interpreter.addTemplate(
    await hamilton.blankPage2.imageData(),
    await hamilton.blankPage2.metadata()
  )
  await interpreter.addTemplate(
    await hamilton.blankPage3.imageData(),
    await hamilton.blankPage3.metadata()
  )

  const { ballot } = await interpreter.interpretBallot(
    await hamilton.filledInPage3.imageData()
  )
  expect(ballot.votes).toMatchInlineSnapshot()
})

test('yesno overvotes', async () => {
  const interpreter = new Interpreter({ election: hamilton.election })

  await interpreter.addTemplate(
    await hamilton.blankPage1.imageData(),
    await hamilton.blankPage1.metadata()
  )
  await interpreter.addTemplate(
    await hamilton.blankPage2.imageData(),
    await hamilton.blankPage2.metadata()
  )
  await interpreter.addTemplate(
    await hamilton.blankPage3.imageData(),
    await hamilton.blankPage3.metadata()
  )
  await interpreter.addTemplate(
    await hamilton.blankPage4.imageData(),
    await hamilton.blankPage4.metadata()
  )
  await interpreter.addTemplate(
    await hamilton.blankPage5.imageData(),
    await hamilton.blankPage5.metadata()
  )

  const { ballot } = await interpreter.interpretBallot(
    await hamilton.filledInPage5YesNoOvervote.imageData()
  )
  expect(ballot.votes).toMatchInlineSnapshot(`
    Object {
      "102": Array [
        "yes",
      ],
      "measure-101": Array [
        "no",
      ],
      "proposition-1": Array [
        "yes",
        "no",
      ],
    }
  `)
})

test('regression: page outline', async () => {
  const interpreter = new Interpreter(election)

  await interpreter.addTemplate(
    await blankPage1.imageData(),
    await blankPage1.metadata()
  )
  await interpreter.addTemplate(
    await blankPage2.imageData(),
    await blankPage2.metadata()
  )

  const { ballot } = await interpreter.interpretBallot(
    await partialBorderPage2.imageData()
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
          "id": "donald-davis",
          "name": "Donald Davis",
          "partyId": "3",
        },
        Object {
          "id": "__write-in-1",
          "isWriteIn": true,
          "name": "Write-In",
        },
      ],
      "dallas-county-commissioners-court-pct-3": Array [
        Object {
          "id": "andrew-jewell",
          "name": "Andrew Jewell",
          "partyId": "7",
        },
      ],
      "dallas-county-proposition-r": Array [
        "no",
      ],
      "dallas-county-retain-chief-justice": Array [
        "yes",
      ],
    }
  `)
})

test('choctaw general 2019', async () => {
  jest.setTimeout(10000)
  const interpreter = new Interpreter(choctaw2019.election)

  await interpreter.addTemplate(
    await choctaw2019.blankPage1.imageData(),
    await choctaw2019.blankPage1.metadata()
  )
  await interpreter.addTemplate(
    await choctaw2019.blankPage2.imageData(),
    await choctaw2019.blankPage2.metadata()
  )

  expect(
    (
      await interpreter.interpretBallot(
        await choctaw2019.filledInPage1.imageData(),
        await choctaw2019.filledInPage1.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "575020970": Array [
        Object {
          "id": "575031910",
          "name": "Andy Gipson",
          "partyId": "3",
        },
      ],
      "575020972": Array [
        Object {
          "id": "575031914",
          "name": "Delbert Hosemann",
          "partyId": "3",
        },
      ],
      "575020973": Array [
        Object {
          "id": "575031916",
          "name": "Johnny DuPree",
          "partyId": "2",
        },
      ],
      "575020974": Array [
        Object {
          "id": "575031918",
          "name": "Shad White",
          "partyId": "3",
        },
      ],
      "575020975": Array [
        Object {
          "id": "575031919",
          "name": "Addie Lee Green",
          "partyId": "2",
        },
      ],
      "575021151": Array [
        Object {
          "id": "575032127",
          "name": "Lynn Fitch",
          "partyId": "3",
        },
      ],
      "575021152": Array [
        Object {
          "id": "575030384",
          "name": "Bob Hickingbottom",
          "partyId": "8",
        },
      ],
    }
  `)

  expect(
    (
      await interpreter.interpretBallot(
        await choctaw2019.filledInPage2.imageData(),
        await choctaw2019.filledInPage2.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "575020971": Array [
        Object {
          "id": "575031912",
          "name": "Mike Chaney",
          "partyId": "3",
        },
      ],
      "575021144": Array [
        Object {
          "id": "575032121",
          "name": "Brandon Presley",
          "partyId": "2",
        },
      ],
      "575021153": Array [
        Object {
          "id": "575032131",
          "name": "John Caldwell",
          "partyId": "3",
        },
      ],
      "575021524": Array [
        Object {
          "id": "575032576",
          "name": "Steve Montgomery",
          "partyId": "2",
        },
      ],
    }
  `)
})

test('determining layout of a ballot with borders', async () => {
  const interpreter = new Interpreter(choctaw2019.election)

  await interpreter.addTemplate(
    await choctaw2019.blankPage1.imageData(),
    await choctaw2019.blankPage1.metadata()
  )

  await interpreter.addTemplate(
    await choctaw2019.blankPage2.imageData(),
    await choctaw2019.blankPage2.metadata()
  )

  await interpreter.addTemplate(
    await choctaw2019.blankPage3.imageData(),
    await choctaw2019.blankPage3.metadata()
  )

  expect(
    (
      await interpreter.interpretBallot(
        await choctaw2019.borderPage1.imageData(),
        await choctaw2019.blankPage1.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`Object {}`)

  expect(
    (
      await interpreter.interpretBallot(
        await choctaw2019.borderPage3.imageData(),
        await choctaw2019.blankPage3.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`Object {}`)
})

test('takes the mark score vote threshold from the election definition if present', () => {
  const interpreter = new Interpreter({
    ...election,
    markThresholds: {
      definite: 0.99,
      marginal: 0.98,
    },
  })

  expect(interpreter['markScoreVoteThreshold']).toEqual(0.99)
})

test('choctaw 2020 general', async () => {
  const interpreter = new Interpreter(choctaw2020.election)

  await interpreter.addTemplate(
    await choctaw2020.blankPage1.imageData(),
    await choctaw2020.blankPage1.metadata()
  )

  await interpreter.addTemplate(
    await choctaw2020.blankPage2.imageData(),
    await choctaw2020.blankPage2.metadata()
  )

  const p1Interpreted = await interpreter.interpretBallot(
    await choctaw2020.filledInPage1.imageData(),
    await choctaw2020.filledInPage1.metadata()
  )
  expect(
    p1Interpreted.marks
      .filter((mark): mark is BallotTargetMark => mark.type !== 'stray')
      .map((mark) => ({
        contest: mark.contest.id,
        option: typeof mark.option === 'string' ? mark.option : mark.option.id,
        score: mark.score,
      }))
  ).toMatchInlineSnapshot(`
    Array [
      Object {
        "contest": "1",
        "option": "1",
        "score": 0.4090909090909091,
      },
      Object {
        "contest": "1",
        "option": "2",
        "score": 0,
      },
      Object {
        "contest": "1",
        "option": "__write-in-0",
        "score": 0,
      },
      Object {
        "contest": "2",
        "option": "21",
        "score": 0.008152173913043478,
      },
      Object {
        "contest": "2",
        "option": "22",
        "score": 0.010869565217391304,
      },
      Object {
        "contest": "2",
        "option": "23",
        "score": 0.5706521739130435,
      },
      Object {
        "contest": "2",
        "option": "__write-in-0",
        "score": 0.016304347826086956,
      },
      Object {
        "contest": "3",
        "option": "31",
        "score": 0.00267379679144385,
      },
      Object {
        "contest": "3",
        "option": "32",
        "score": 0.8529411764705882,
      },
      Object {
        "contest": "3",
        "option": "__write-in-0",
        "score": 0,
      },
      Object {
        "contest": "4",
        "option": "41",
        "score": 0.010869565217391304,
      },
      Object {
        "contest": "4",
        "option": "42",
        "score": 0.01358695652173913,
      },
      Object {
        "contest": "4",
        "option": "__write-in-0",
        "score": 0.7445652173913043,
      },
      Object {
        "contest": "initiative-65",
        "option": "yes",
        "score": 0.6005434782608695,
      },
      Object {
        "contest": "initiative-65",
        "option": "no",
        "score": 0.41847826086956524,
      },
      Object {
        "contest": "initiative-65-a",
        "option": "yes",
        "score": 0.41847826086956524,
      },
      Object {
        "contest": "initiative-65-a",
        "option": "no",
        "score": 0,
      },
    ]
  `)

  const p2Interpreted = await interpreter.interpretBallot(
    await choctaw2020.filledInPage2.imageData(),
    await choctaw2020.filledInPage2.metadata()
  )
  expect(
    p2Interpreted.marks
      .filter((mark): mark is BallotTargetMark => mark.type !== 'stray')
      .map((mark) => ({
        contest: mark.contest.id,
        option: typeof mark.option === 'string' ? mark.option : mark.option.id,
        score: mark.score,
      }))
  ).toMatchInlineSnapshot(`
    Array [
      Object {
        "contest": "flag-question",
        "option": "yes",
        "score": 0.6075268817204301,
      },
      Object {
        "contest": "flag-question",
        "option": "no",
        "score": 0.008064516129032258,
      },
      Object {
        "contest": "runoffs-question",
        "option": "yes",
        "score": 0.002688172043010753,
      },
      Object {
        "contest": "runoffs-question",
        "option": "no",
        "score": 0.46774193548387094,
      },
    ]
  `)
})

test('normalizes intentionally empty pages correctly', async () => {
  const fixtures = choctaw2020Special
  const { election } = fixtures
  const interpreter = new Interpreter(election)

  await interpreter.addTemplate(await fixtures.blankPage1.imageData())
  const page2Template = await interpreter.addTemplate(
    await fixtures.blankPage2.imageData()
  )
  const { mappedBallot } = await interpreter.interpretBallot(
    await fixtures.absenteePage2.imageData()
  )

  // there was a bug where all pixels were white
  expect(mappedBallot.data.some((px) => px !== 0xff)).toBe(true)

  // ensure the size is the same as the template
  expect(mappedBallot.width).toEqual(page2Template.ballotImage.imageData.width)
  expect(mappedBallot.height).toEqual(
    page2Template.ballotImage.imageData.height
  )
})

test('regression: overvote on choctaw county p1-05', async () => {
  const fixtures = choctaw2020LegalSize
  const { election } = fixtures
  const interpreter = new Interpreter({ election, testMode: true })

  await interpreter.addTemplate(await fixtures.district5BlankPage1.imageData())
  const interpretation = await interpreter.interpretBallot(
    await fixtures.filledInPage1_05.imageData()
  )

  expect(
    interpretation.marks
      .filter((mark): mark is BallotTargetMark => mark.type !== 'stray')
      .map((mark) => [mark.score, mark.option])
  ).toMatchInlineSnapshot(`
    Array [
      Array [
        0.0053475935828877,
        Object {
          "id": "775032091",
          "name": "Presidential Electors for Joseph R. Biden Jr. for President and Kamala D. Harris for Vice President",
          "partyId": "2",
        },
      ],
      Array [
        0,
        Object {
          "id": "775032092",
          "name": "Presidential Electors for Donald J. Trump for President and Michael R. Pence for Vice President",
          "partyId": "3",
        },
      ],
      Array [
        0.002717391304347826,
        Object {
          "id": "775032126",
          "name": "Presidential Electors for Don Blankenship for President and William Mohr for Vice President",
          "partyId": "775000002",
        },
      ],
      Array [
        0,
        Object {
          "id": "775032100",
          "name": "Presidential Electors for Brian Carroll for President and Amar Patel for Vice President",
          "partyId": "775000001",
        },
      ],
      Array [
        0.005434782608695652,
        Object {
          "id": "775032096",
          "name": "Presidential Electors for Phil Collins for President and Bill Parker for Vice President",
          "partyId": "11",
        },
      ],
      Array [
        0.8913043478260869,
        Object {
          "id": "775032099",
          "name": "Presidential Electors for Howie Hawkins for President and Angela Nicole Walker for Vice President",
          "partyId": "9",
        },
      ],
      Array [
        0,
        Object {
          "id": "775032102",
          "name": "Presidential Electors for Jo Jorgensen for President and Jeremy 'Spike' Cohen for Vice President",
          "partyId": "4",
        },
      ],
      Array [
        0,
        Object {
          "id": "775032117",
          "name": "Presidential Electors for Brock Pierce for President and Karla Ballard for Vice President",
          "partyId": "11",
        },
      ],
      Array [
        0.005434782608695652,
        Object {
          "id": "775032098",
          "name": "Presidential Electors for Kanye West for President and Michelle Tidball for Vice President",
          "partyId": "11",
        },
      ],
      Array [
        0,
        Object {
          "id": "__write-in-0",
          "isWriteIn": true,
          "name": "Write-In",
        },
      ],
      Array [
        0,
        Object {
          "id": "775032093",
          "name": "Mike Espy",
          "partyId": "2",
        },
      ],
      Array [
        0.008152173913043478,
        Object {
          "id": "775032094",
          "name": "Cindy Hyde-Smith",
          "partyId": "3",
        },
      ],
      Array [
        0.8913043478260869,
        Object {
          "id": "775032105",
          "name": "Jimmy L. Edwards",
          "partyId": "4",
        },
      ],
      Array [
        0,
        Object {
          "id": "__write-in-0",
          "isWriteIn": true,
          "name": "Write-In",
        },
      ],
      Array [
        0,
        Object {
          "id": "775032084",
          "name": "Antonia Eliason",
          "partyId": "2",
        },
      ],
      Array [
        0.8913043478260869,
        Object {
          "id": "775032085",
          "name": "Trent Kelly",
          "partyId": "3",
        },
      ],
      Array [
        0,
        Object {
          "id": "__write-in-0",
          "isWriteIn": true,
          "name": "Write-In",
        },
      ],
      Array [
        0.002717391304347826,
        Object {
          "id": "775032082",
          "name": "Josiah Dennis Coleman",
          "partyId": "12",
        },
      ],
      Array [
        0.8913043478260869,
        Object {
          "id": "775032110",
          "name": "Percy L. Lynchard",
          "partyId": "12",
        },
      ],
      Array [
        0.00267379679144385,
        Object {
          "id": "__write-in-0",
          "isWriteIn": true,
          "name": "Write-In",
        },
      ],
      Array [
        0.8983957219251337,
        Object {
          "id": "775032689",
          "name": "Wayne McLeod",
        },
      ],
      Array [
        0.008152173913043478,
        Object {
          "id": "__write-in-0",
          "isWriteIn": true,
          "name": "Write-In",
        },
      ],
      Array [
        0.8913043478260869,
        Object {
          "id": "775032690",
          "name": "Michael D Thomas",
        },
      ],
      Array [
        0,
        Object {
          "id": "__write-in-0",
          "isWriteIn": true,
          "name": "Write-In",
        },
      ],
    ]
  `)
  expect(interpretation.ballot.votes).toMatchInlineSnapshot(`
    Object {
      "775020890": Array [
        Object {
          "id": "775032110",
          "name": "Percy L. Lynchard",
          "partyId": "12",
        },
      ],
      "775020892": Array [
        Object {
          "id": "775032085",
          "name": "Trent Kelly",
          "partyId": "3",
        },
      ],
      "775020896": Array [
        Object {
          "id": "775032099",
          "name": "Presidential Electors for Howie Hawkins for President and Angela Nicole Walker for Vice President",
          "partyId": "9",
        },
      ],
      "775020897": Array [
        Object {
          "id": "775032105",
          "name": "Jimmy L. Edwards",
          "partyId": "4",
        },
      ],
      "775021420": Array [
        Object {
          "id": "775032689",
          "name": "Wayne McLeod",
        },
      ],
      "775021421": Array [
        Object {
          "id": "775032690",
          "name": "Michael D Thomas",
        },
      ],
    }
  `)
})

test('rejects an incorrect-but-plausible contest layout', async () => {
  const fixtures = choctaw2020LegalSize
  const interpreter = new Interpreter({
    election: fixtures.election,
    testMode: true,
  })

  await interpreter.addTemplate(await fixtures.district5BlankPage1.imageData())
  const p2 = await interpreter.addTemplate(
    await fixtures.district5BlankPage2.imageData()
  )

  try {
    await interpreter.interpretBallot(
      await fixtures.filledInPage2_06.imageData(),
      p2.ballotImage.metadata
    )
    fail('expected interpretation to fail')
  } catch (error) {
    expect(error.message).toMatch(
      'ballot and template contest shapes do not correspond'
    )
  }
})
