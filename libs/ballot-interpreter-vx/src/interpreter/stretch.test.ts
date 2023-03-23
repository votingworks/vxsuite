import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { buildInterpreterWithFixtures } from '../../test/helpers/fixtures_to_templates';
import { Fixture } from '../../test/fixtures';

test('stretched precinct scanner ballot', async () => {
  const fixtures = electionFamousNames2021Fixtures;
  const { electionDefinition } = fixtures;
  const { interpreter } = await buildInterpreterWithFixtures({
    electionDefinition,
    fixtures: [
      new Fixture(fixtures.blankPage1.asFilePath()),
      new Fixture(fixtures.blankPage2.asFilePath()),
    ],
    useFixtureMetadata: false,
  });

  expect(
    (
      await interpreter.interpretBallot(
        await fixtures.markedPrecinctScannerStretchPage2.asImageData()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
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
          "id": "pablo-picasso",
          "name": "Pablo Picasso",
          "partyIds": Array [
            "1",
          ],
        },
      ],
      "city-council": Array [
        Object {
          "id": "mark-antony",
          "name": "Mark Antony",
          "partyIds": Array [
            "0",
          ],
        },
        Object {
          "id": "marilyn-monroe",
          "name": "Marilyn Monroe",
          "partyIds": Array [
            "1",
          ],
        },
        Object {
          "id": "write-in-0",
          "isWriteIn": true,
          "name": "Write-In #1",
        },
      ],
    }
  `);
});
