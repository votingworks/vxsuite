import * as oaklawn from '../../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library';
import { Interpreter } from '.';

test('invalid marks', async () => {
  const fixtures = oaklawn;
  const { electionDefinition } = fixtures;
  const interpreter = new Interpreter({ electionDefinition });

  interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await fixtures.blankPage1.imageData(),
      await fixtures.blankPage1.metadata()
    )
  );
  interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await fixtures.blankPage2.imageData(),
      await fixtures.blankPage2.metadata()
    )
  );

  const { ballot, marks } = await interpreter.interpretBallot(
    await fixtures.filledInPage2.imageData(),
    await fixtures.filledInPage2.metadata()
  );
  expect(ballot.votes).toMatchInlineSnapshot(`
    Object {
      "dallas-city-council": Array [
        Object {
          "id": "randall-rupp",
          "name": "Randall Rupp",
          "partyIds": Array [
            "2",
          ],
        },
        Object {
          "id": "donald-davis",
          "name": "Donald Davis",
          "partyIds": Array [
            "3",
          ],
        },
        Object {
          "id": "write-in-1",
          "isWriteIn": true,
          "name": "Write-In",
        },
      ],
      "dallas-county-commissioners-court-pct-3": Array [
        Object {
          "id": "andrew-jewell",
          "name": "Andrew Jewell",
          "partyIds": Array [
            "7",
          ],
        },
      ],
      "dallas-county-proposition-r": Array [
        "no",
      ],
      "dallas-county-retain-chief-justice": Array [
        "yes",
      ],
    }
  `);

  expect(marks).toMatchInlineSnapshot(`
    Array [
      Object {
        "bounds": Object {
          "height": 22,
          "width": 33,
          "x": 67,
          "y": 242,
        },
        "contestId": "dallas-county-commissioners-court-pct-3",
        "optionId": "john-wiley-price",
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
        "contestId": "dallas-county-commissioners-court-pct-3",
        "optionId": "s-t-russell",
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
        "contestId": "dallas-county-commissioners-court-pct-3",
        "optionId": "andrew-jewell",
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
        "contestId": "dallas-county-commissioners-court-pct-3",
        "optionId": "write-in-0",
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
        "contestId": "dallas-county-commissioners-court-pct-3",
        "optionId": "write-in-1",
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
        "contestId": "dallas-county-retain-chief-justice",
        "optionId": "yes",
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
        "contestId": "dallas-county-retain-chief-justice",
        "optionId": "no",
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
        "contestId": "dallas-county-proposition-r",
        "optionId": "yes",
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
        "contestId": "dallas-county-proposition-r",
        "optionId": "no",
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
        "contestId": "dallas-city-council",
        "optionId": "harvey-eagle",
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
        "contestId": "dallas-city-council",
        "optionId": "randall-rupp",
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
        "contestId": "dallas-city-council",
        "optionId": "carroll-shry",
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
        "contestId": "dallas-city-council",
        "optionId": "beverly-barker",
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
        "contestId": "dallas-city-council",
        "optionId": "donald-davis",
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
        "contestId": "dallas-city-council",
        "optionId": "hugo-smith",
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
        "contestId": "dallas-city-council",
        "optionId": "write-in-0",
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
        "contestId": "dallas-city-council",
        "optionId": "write-in-1",
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
        "contestId": "dallas-city-council",
        "optionId": "write-in-2",
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
        "contestId": "dallas-mayor",
        "optionId": "orville-white",
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
        "contestId": "dallas-mayor",
        "optionId": "gregory-seldon",
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
        "contestId": "dallas-mayor",
        "optionId": "write-in-0",
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
  `);
});
