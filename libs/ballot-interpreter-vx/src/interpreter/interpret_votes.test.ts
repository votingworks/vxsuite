import * as oaklawn from '../../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library';
import { Interpreter } from '.';

test('interpret votes', async () => {
  const fixtures = oaklawn;
  const { electionDefinition } = fixtures;
  const interpreter = new Interpreter({ electionDefinition });

  interpreter.addTemplate(
    await interpreter.interpretTemplate(await fixtures.blankPage1.imageData())
  );

  const { ballot, marks } = await interpreter.interpretBallot(
    await fixtures.filledInPage1.imageData()
  );
  expect(ballot.votes).toMatchInlineSnapshot(`
    Object {
      "dallas-county-sheriff": Array [
        Object {
          "id": "chad-prda",
          "name": "Chad Prda",
          "partyIds": Array [
            "3",
          ],
        },
      ],
      "dallas-county-tax-assessor": Array [
        Object {
          "id": "john-ames",
          "name": "John Ames",
          "partyIds": Array [
            "2",
          ],
        },
      ],
      "texas-house-district-111": Array [
        Object {
          "id": "write-in-0",
          "isWriteIn": true,
          "name": "Write-In",
        },
      ],
      "texas-sc-judge-place-6": Array [
        Object {
          "id": "jane-bland",
          "name": "Jane Bland",
          "partyIds": Array [
            "3",
          ],
        },
      ],
      "us-house-district-30": Array [
        Object {
          "id": "eddie-bernice-johnson",
          "name": "Eddie Bernice Johnson",
          "partyIds": Array [
            "2",
          ],
        },
      ],
      "us-senate": Array [
        Object {
          "id": "tim-smith",
          "name": "Tim Smith",
          "partyIds": Array [
            "6",
          ],
        },
      ],
    }
  `);

  expect(
    marks.map((mark) => ({
      type: mark.type,
      option: mark.optionId,
      score: mark.score,
    }))
  ).toMatchInlineSnapshot(`
    Array [
      Object {
        "option": "john-cornyn",
        "score": 0,
        "type": "candidate",
      },
      Object {
        "option": "james-brumley",
        "score": 0,
        "type": "candidate",
      },
      Object {
        "option": "cedric-jefferson",
        "score": 0,
        "type": "candidate",
      },
      Object {
        "option": "tim-smith",
        "score": 0.8765432098765432,
        "type": "candidate",
      },
      Object {
        "option": "arjun-srinivasan",
        "score": 0.0024630541871921183,
        "type": "candidate",
      },
      Object {
        "option": "ricardo-turullols-bonilla",
        "score": 0.007407407407407408,
        "type": "candidate",
      },
      Object {
        "option": "eddie-bernice-johnson",
        "score": 0.7832512315270936,
        "type": "candidate",
      },
      Object {
        "option": "tre-pennie",
        "score": 0.0024449877750611247,
        "type": "candidate",
      },
      Object {
        "option": "jane-bland",
        "score": 0.7524509803921569,
        "type": "candidate",
      },
      Object {
        "option": "kathy-cheng",
        "score": 0.004889975550122249,
        "type": "candidate",
      },
      Object {
        "option": "yvonne-davis",
        "score": 0,
        "type": "candidate",
      },
      Object {
        "option": "write-in-0",
        "score": 0.8029556650246306,
        "type": "candidate",
      },
      Object {
        "option": "john-ames",
        "score": 0.8866995073891626,
        "type": "candidate",
      },
      Object {
        "option": "write-in-0",
        "score": 0,
        "type": "candidate",
      },
      Object {
        "option": "marian-brown",
        "score": 0,
        "type": "candidate",
      },
      Object {
        "option": "chad-prda",
        "score": 0.7,
        "type": "candidate",
      },
      Object {
        "option": "write-in-0",
        "score": 0,
        "type": "candidate",
      },
    ]
  `);
});
