import * as oaklawn from '../../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library';
import { Interpreter } from '.';

jest.setTimeout(10000);

test('upside-down ballot', async () => {
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

  const { ballot, metadata } = await interpreter.interpretBallot(
    await fixtures.filledInPage1.imageData()
  );
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
          "id": "write-in-0",
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
  `);

  const {
    ballot: { votes: votesWithFlipped },
  } = await interpreter.interpretBallot(
    await fixtures.filledInPage1.imageData({ flipped: true }),
    metadata,
    { flipped: true }
  );

  expect(votesWithFlipped).toEqual(ballot.votes);
});
