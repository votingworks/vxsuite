import * as choctawMock2020 from '../../test/fixtures/choctaw-county-mock-general-election-choctaw-2020-a63f5c1f68';
import { Interpreter } from '.';

test('interpret two-column template', async () => {
  const { electionDefinition } = choctawMock2020;
  const interpreter = new Interpreter({ electionDefinition });

  {
    const template = interpreter.addTemplate(
      await interpreter.interpretTemplate(
        await choctawMock2020.blankPage1.imageData(),
        // provide the metadata because the QR code uses raw binary, not base64
        // binary. this causes qrdetect (zbar) to read it incorrectly
        await choctawMock2020.blankPage1.metadata()
      )
    );

    expect(template.ballotPageLayout.metadata).toMatchInlineSnapshot(`
      Object {
        "ballotStyleId": "1",
        "ballotType": 0,
        "electionHash": "a63f5c1f68ad809d879d91310ff98026fb293ff446ac3354b5c5b2c3b5600357",
        "isTestMode": false,
        "locales": Object {
          "primary": "en-US",
        },
        "pageNumber": 1,
        "precinctId": "6525",
      }
    `);

    expect(template.ballotPageLayout.contests).toMatchInlineSnapshot(`
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
    `);
  }

  {
    const template = interpreter.addTemplate(
      await interpreter.interpretTemplate(
        await choctawMock2020.blankPage2.imageData(),
        await choctawMock2020.blankPage2.metadata()
      )
    );

    expect(template.ballotPageLayout.metadata).toMatchInlineSnapshot(`
      Object {
        "ballotStyleId": "1",
        "ballotType": 0,
        "electionHash": "a63f5c1f68ad809d879d91310ff98026fb293ff446ac3354b5c5b2c3b5600357",
        "isTestMode": false,
        "locales": Object {
          "primary": "en-US",
        },
        "pageNumber": 2,
        "precinctId": "6525",
      }
    `);

    expect(template.ballotPageLayout.contests).toMatchInlineSnapshot(`
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
    `);
  }

  {
    const {
      ballot: { votes },
    } = await interpreter.interpretBallot(
      await choctawMock2020.filledInPage1.imageData(),
      await choctawMock2020.filledInPage1.metadata()
    );
    expect(votes).toMatchInlineSnapshot(`
      Object {
        "775020870": Array [
          Object {
            "id": "write-in-0",
            "isWriteIn": true,
            "name": "Write-In",
          },
        ],
        "775020872": Array [
          Object {
            "id": "775031979",
            "name": "Trent Kelly",
            "partyIds": Array [
              "3",
            ],
          },
        ],
        "775020876": Array [
          Object {
            "id": "775031989",
            "name": "Presidential Electors for Phil Collins for President and Bill Parker for Vice President",
            "partyIds": Array [
              "11",
            ],
          },
        ],
        "775020877": Array [
          Object {
            "id": "775031985",
            "name": "Mike Espy",
            "partyIds": Array [
              "2",
            ],
          },
        ],
        "775020902": Array [
          Object {
            "id": "775032019",
            "name": "Willie Mae Guillory",
          },
        ],
      }
    `);
  }

  {
    const {
      ballot: { votes },
    } = await interpreter.interpretBallot(
      await choctawMock2020.filledInPage2.imageData(),
      await choctawMock2020.filledInPage2.metadata()
    );
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
    `);
  }
});
