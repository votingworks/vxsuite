import * as oaklawn from '../../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library';
import { Interpreter } from '.';

jest.setTimeout(10000);

test('interpret three-column template with instructions', async () => {
  const fixtures = oaklawn;
  const { electionDefinition } = fixtures;
  const interpreter = new Interpreter({ electionDefinition });
  const imageData = await fixtures.blankPage1.imageData();
  const template = await interpreter.interpretTemplate(imageData);

  expect(template.ballotPageLayout.metadata).toMatchInlineSnapshot(`
    Object {
      "ballotStyleId": "77",
      "ballotType": 0,
      "electionHash": "e012488b8fd567899e4d1b931343ac74e9a8803e33adf8657ab27bbb4408a492",
      "isTestMode": false,
      "locales": Object {
        "primary": "en-US",
      },
      "pageNumber": 1,
      "precinctId": "42",
    }
  `);

  expect(template.ballotPageLayout.contests).toMatchInlineSnapshot(`
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
  `);
});
