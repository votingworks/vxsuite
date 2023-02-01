import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { Interpreter } from '.';

test('interpret two-column template', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const interpreter = new Interpreter({ electionDefinition });

  {
    const template = interpreter.addTemplate(
      await interpreter.interpretTemplate(
        await electionFamousNames2021Fixtures.blankPage1.asImageData()
      )
    );

    expect(template.ballotPageLayout.metadata).toMatchInlineSnapshot(`
      Object {
        "ballotId": undefined,
        "ballotStyleId": "1",
        "ballotType": 0,
        "electionHash": "befef88b3a5092a41461",
        "isTestMode": false,
        "locales": Object {
          "primary": "en-US",
          "secondary": undefined,
        },
        "pageNumber": 1,
        "precinctId": "21",
      }
    `);

    expect(template.ballotPageLayout.contests).toMatchInlineSnapshot(`
      Array [
        Object {
          "bounds": Object {
            "height": 329,
            "width": 366,
            "x": 429,
            "y": 43,
          },
          "corners": Array [
            Object {
              "x": 429,
              "y": 43,
            },
            Object {
              "x": 794,
              "y": 43,
            },
            Object {
              "x": 429,
              "y": 371,
            },
            Object {
              "x": 794,
              "y": 371,
            },
          ],
          "options": Array [
            Object {
              "bounds": Object {
                "height": 69,
                "width": 366,
                "x": 429,
                "y": 163,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 454,
                  "y": 165,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 456,
                  "y": 167,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 70,
                "width": 366,
                "x": 429,
                "y": 232,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 454,
                  "y": 234,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 456,
                  "y": 236,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 68,
                "width": 366,
                "x": 429,
                "y": 302,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 454,
                  "y": 304,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 456,
                  "y": 306,
                },
              },
            },
          ],
        },
        Object {
          "bounds": Object {
            "height": 398,
            "width": 366,
            "x": 429,
            "y": 393,
          },
          "corners": Array [
            Object {
              "x": 429,
              "y": 393,
            },
            Object {
              "x": 794,
              "y": 393,
            },
            Object {
              "x": 429,
              "y": 790,
            },
            Object {
              "x": 794,
              "y": 790,
            },
          ],
          "options": Array [
            Object {
              "bounds": Object {
                "height": 69,
                "width": 366,
                "x": 429,
                "y": 512,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 454,
                  "y": 514,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 456,
                  "y": 516,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 71,
                "width": 366,
                "x": 429,
                "y": 581,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 454,
                  "y": 583,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 456,
                  "y": 585,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 70,
                "width": 366,
                "x": 429,
                "y": 652,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 454,
                  "y": 654,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 456,
                  "y": 656,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 67,
                "width": 366,
                "x": 429,
                "y": 722,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 454,
                  "y": 724,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 456,
                  "y": 726,
                },
              },
            },
          ],
        },
        Object {
          "bounds": Object {
            "height": 329,
            "width": 366,
            "x": 429,
            "y": 811,
          },
          "corners": Array [
            Object {
              "x": 429,
              "y": 811,
            },
            Object {
              "x": 794,
              "y": 811,
            },
            Object {
              "x": 429,
              "y": 1139,
            },
            Object {
              "x": 794,
              "y": 1139,
            },
          ],
          "options": Array [
            Object {
              "bounds": Object {
                "height": 70,
                "width": 366,
                "x": 429,
                "y": 931,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 454,
                  "y": 933,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 456,
                  "y": 935,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 71,
                "width": 366,
                "x": 429,
                "y": 1001,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 454,
                  "y": 1003,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 456,
                  "y": 1005,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 66,
                "width": 366,
                "x": 429,
                "y": 1072,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 454,
                  "y": 1074,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 456,
                  "y": 1076,
                },
              },
            },
          ],
        },
        Object {
          "bounds": Object {
            "height": 398,
            "width": 365,
            "x": 816,
            "y": 43,
          },
          "corners": Array [
            Object {
              "x": 816,
              "y": 43,
            },
            Object {
              "x": 1180,
              "y": 43,
            },
            Object {
              "x": 816,
              "y": 440,
            },
            Object {
              "x": 1180,
              "y": 440,
            },
          ],
          "options": Array [
            Object {
              "bounds": Object {
                "height": 69,
                "width": 365,
                "x": 816,
                "y": 163,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 841,
                  "y": 165,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 843,
                  "y": 167,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 70,
                "width": 365,
                "x": 816,
                "y": 232,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 841,
                  "y": 234,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 843,
                  "y": 236,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 71,
                "width": 365,
                "x": 816,
                "y": 302,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 841,
                  "y": 304,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 843,
                  "y": 306,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 66,
                "width": 365,
                "x": 816,
                "y": 373,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 841,
                  "y": 375,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 843,
                  "y": 377,
                },
              },
            },
          ],
        },
        Object {
          "bounds": Object {
            "height": 470,
            "width": 365,
            "x": 816,
            "y": 462,
          },
          "corners": Array [
            Object {
              "x": 816,
              "y": 462,
            },
            Object {
              "x": 1180,
              "y": 462,
            },
            Object {
              "x": 816,
              "y": 931,
            },
            Object {
              "x": 1180,
              "y": 931,
            },
          ],
          "options": Array [
            Object {
              "bounds": Object {
                "height": 71,
                "width": 365,
                "x": 816,
                "y": 581,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 841,
                  "y": 583,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 843,
                  "y": 585,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 70,
                "width": 365,
                "x": 816,
                "y": 652,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 841,
                  "y": 654,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 843,
                  "y": 656,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 71,
                "width": 365,
                "x": 816,
                "y": 722,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 841,
                  "y": 724,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 843,
                  "y": 726,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 69,
                "width": 365,
                "x": 816,
                "y": 793,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 841,
                  "y": 795,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 843,
                  "y": 797,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 68,
                "width": 365,
                "x": 816,
                "y": 862,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 841,
                  "y": 864,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 843,
                  "y": 866,
                },
              },
            },
          ],
        },
      ]
    `);
  }

  {
    const template = interpreter.addTemplate(
      await interpreter.interpretTemplate(
        await electionFamousNames2021Fixtures.blankPage2.asImageData()
      )
    );

    expect(template.ballotPageLayout.metadata).toMatchInlineSnapshot(`
      Object {
        "ballotId": undefined,
        "ballotStyleId": "1",
        "ballotType": 0,
        "electionHash": "befef88b3a5092a41461",
        "isTestMode": false,
        "locales": Object {
          "primary": "en-US",
          "secondary": undefined,
        },
        "pageNumber": 2,
        "precinctId": "21",
      }
    `);

    expect(template.ballotPageLayout.contests).toMatchInlineSnapshot(`
      Array [
        Object {
          "bounds": Object {
            "height": 494,
            "width": 365,
            "x": 43,
            "y": 43,
          },
          "corners": Array [
            Object {
              "x": 43,
              "y": 43,
            },
            Object {
              "x": 407,
              "y": 43,
            },
            Object {
              "x": 43,
              "y": 536,
            },
            Object {
              "x": 407,
              "y": 536,
            },
          ],
          "options": Array [
            Object {
              "bounds": Object {
                "height": 71,
                "width": 365,
                "x": 43,
                "y": 188,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 69,
                  "y": 190,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 71,
                  "y": 192,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 69,
                "width": 365,
                "x": 43,
                "y": 259,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 69,
                  "y": 261,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 71,
                  "y": 263,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 70,
                "width": 365,
                "x": 43,
                "y": 328,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 69,
                  "y": 330,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 71,
                  "y": 332,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 71,
                "width": 365,
                "x": 43,
                "y": 398,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 69,
                  "y": 400,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 71,
                  "y": 402,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 66,
                "width": 365,
                "x": 43,
                "y": 469,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 69,
                  "y": 471,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 71,
                  "y": 473,
                },
              },
            },
          ],
        },
        Object {
          "bounds": Object {
            "height": 775,
            "width": 366,
            "x": 429,
            "y": 43,
          },
          "corners": Array [
            Object {
              "x": 429,
              "y": 43,
            },
            Object {
              "x": 794,
              "y": 43,
            },
            Object {
              "x": 429,
              "y": 817,
            },
            Object {
              "x": 794,
              "y": 817,
            },
          ],
          "options": Array [
            Object {
              "bounds": Object {
                "height": 69,
                "width": 366,
                "x": 429,
                "y": 163,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 454,
                  "y": 165,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 456,
                  "y": 167,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 70,
                "width": 366,
                "x": 429,
                "y": 232,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 454,
                  "y": 234,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 456,
                  "y": 236,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 71,
                "width": 366,
                "x": 429,
                "y": 302,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 454,
                  "y": 304,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 456,
                  "y": 306,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 70,
                "width": 366,
                "x": 429,
                "y": 373,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 454,
                  "y": 375,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 456,
                  "y": 377,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 69,
                "width": 366,
                "x": 429,
                "y": 443,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 454,
                  "y": 445,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 456,
                  "y": 447,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 71,
                "width": 366,
                "x": 429,
                "y": 512,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 454,
                  "y": 514,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 456,
                  "y": 516,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 55,
                "width": 366,
                "x": 429,
                "y": 583,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 454,
                  "y": 585,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 456,
                  "y": 587,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 56,
                "width": 366,
                "x": 429,
                "y": 638,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 454,
                  "y": 640,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 456,
                  "y": 642,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 55,
                "width": 366,
                "x": 429,
                "y": 694,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 454,
                  "y": 696,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 456,
                  "y": 698,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 67,
                "width": 366,
                "x": 429,
                "y": 749,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 454,
                  "y": 751,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 456,
                  "y": 753,
                },
              },
            },
          ],
        },
        Object {
          "bounds": Object {
            "height": 985,
            "width": 365,
            "x": 816,
            "y": 43,
          },
          "corners": Array [
            Object {
              "x": 816,
              "y": 43,
            },
            Object {
              "x": 1180,
              "y": 43,
            },
            Object {
              "x": 816,
              "y": 1027,
            },
            Object {
              "x": 1180,
              "y": 1027,
            },
          ],
          "options": Array [
            Object {
              "bounds": Object {
                "height": 69,
                "width": 365,
                "x": 816,
                "y": 163,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 841,
                  "y": 165,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 843,
                  "y": 167,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 70,
                "width": 365,
                "x": 816,
                "y": 232,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 841,
                  "y": 234,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 843,
                  "y": 236,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 71,
                "width": 365,
                "x": 816,
                "y": 302,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 841,
                  "y": 304,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 843,
                  "y": 306,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 70,
                "width": 365,
                "x": 816,
                "y": 373,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 841,
                  "y": 375,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 843,
                  "y": 377,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 69,
                "width": 365,
                "x": 816,
                "y": 443,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 841,
                  "y": 445,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 843,
                  "y": 447,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 71,
                "width": 365,
                "x": 816,
                "y": 512,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 841,
                  "y": 514,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 843,
                  "y": 516,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 70,
                "width": 365,
                "x": 816,
                "y": 583,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 841,
                  "y": 585,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 843,
                  "y": 587,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 69,
                "width": 365,
                "x": 816,
                "y": 653,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 841,
                  "y": 655,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 843,
                  "y": 657,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 71,
                "width": 365,
                "x": 816,
                "y": 722,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 841,
                  "y": 724,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 843,
                  "y": 726,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 55,
                "width": 365,
                "x": 816,
                "y": 793,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 841,
                  "y": 795,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 843,
                  "y": 797,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 56,
                "width": 365,
                "x": 816,
                "y": 848,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 841,
                  "y": 850,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 843,
                  "y": 852,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 55,
                "width": 365,
                "x": 816,
                "y": 904,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 31,
                  "x": 842,
                  "y": 906,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 843,
                  "y": 908,
                },
              },
            },
            Object {
              "bounds": Object {
                "height": 67,
                "width": 365,
                "x": 816,
                "y": 959,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 841,
                  "y": 961,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 843,
                  "y": 963,
                },
              },
            },
          ],
        },
      ]
    `);
  }

  {
    const {
      ballot: { votes },
    } = await interpreter.interpretBallot(
      await electionFamousNames2021Fixtures.handMarkedBallotCompletePage1.asImageData()
    );
    expect(votes).toMatchInlineSnapshot(`
      Object {
        "attorney": Array [
          Object {
            "id": "john-snow",
            "name": "John Snow",
            "partyIds": Array [
              "1",
            ],
          },
        ],
        "chief-of-police": Array [
          Object {
            "id": "andy-warhol",
            "name": "Andy Warhol",
            "partyIds": Array [
              "3",
            ],
          },
        ],
        "controller": Array [
          Object {
            "id": "winston-churchill",
            "name": "Winston Churchill",
            "partyIds": Array [
              "0",
            ],
          },
        ],
        "mayor": Array [
          Object {
            "id": "sherlock-holmes",
            "name": "Sherlock Holmes",
            "partyIds": Array [
              "0",
            ],
          },
        ],
        "public-works-director": Array [
          Object {
            "id": "robert-downey-jr",
            "name": "Robert Downey Jr.",
            "partyIds": Array [
              "1",
            ],
          },
        ],
      }
    `);
  }

  {
    const {
      ballot: { votes },
    } = await interpreter.interpretBallot(
      await electionFamousNames2021Fixtures.handMarkedBallotCompletePage2.asImageData()
    );
    expect(votes).toMatchInlineSnapshot(`
      Object {
        "board-of-alderman": Array [
          Object {
            "id": "steve-jobs",
            "name": "Steve Jobs",
            "partyIds": Array [
              "1",
            ],
          },
          Object {
            "id": "nikola-tesla",
            "name": "Nikola Tesla",
            "partyIds": Array [
              "0",
            ],
          },
          Object {
            "id": "vincent-van-gogh",
            "name": "Vincent Van Gogh",
            "partyIds": Array [
              "1",
            ],
          },
          Object {
            "id": "pablo-picasso",
            "name": "Pablo Picasso",
            "partyIds": Array [
              "1",
            ],
          },
        ],
        "city-council": Array [
          Object {
            "id": "marie-curie",
            "name": "Marie Curie",
            "partyIds": Array [
              "0",
            ],
          },
          Object {
            "id": "mona-lisa",
            "name": "Mona Lisa",
            "partyIds": Array [
              "3",
            ],
          },
          Object {
            "id": "tim-allen",
            "name": "Tim Allen",
            "partyIds": Array [
              "2",
            ],
          },
          Object {
            "id": "harriet-tubman",
            "name": "Harriet Tubman",
            "partyIds": Array [
              "1",
            ],
          },
        ],
        "parks-and-recreation-director": Array [
          Object {
            "id": "write-in-0",
            "isWriteIn": true,
            "name": "Write-In",
          },
        ],
      }
    `);
  }
});
