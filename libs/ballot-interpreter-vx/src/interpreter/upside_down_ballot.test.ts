import * as oaklawn from '../../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library';
import { buildInterpreterWithFixtures } from '../../test/helpers/fixtures_to_templates';

test('upside-down ballot', async () => {
  const fixtures = oaklawn;
  const { electionDefinition } = fixtures;
  const { interpreter } = await buildInterpreterWithFixtures({
    electionDefinition,
    fixtures: [fixtures.blankPage1, fixtures.blankPage2],
    useFixtureMetadata: true,
  });

  const { ballot, metadata } = await interpreter.interpretBallot(
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
          "name": "Write-In #1",
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

  const {
    ballot: { votes: votesWithFlipped },
  } = await interpreter.interpretBallot(
    await fixtures.filledInPage1.imageData({ flipped: true }),
    metadata,
    { flipped: true }
  );

  expect(votesWithFlipped).toEqual(ballot.votes);
});
