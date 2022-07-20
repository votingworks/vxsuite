import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { Interpreter } from '.';

test('stretched precinct scanner ballot', async () => {
  const fixtures = electionFamousNames2021Fixtures;
  const { electionDefinition } = fixtures;
  const interpreter = new Interpreter({ electionDefinition });

  interpreter.addTemplate(
    await interpreter.interpretTemplate(await fixtures.blankPage1AsImageData())
  );
  interpreter.addTemplate(
    await interpreter.interpretTemplate(await fixtures.blankPage2AsImageData())
  );

  expect(
    (
      await interpreter.interpretBallot(
        await fixtures.markedPrecinctScannerStretchPage2AsImageData()
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
          "name": "Write-In",
        },
      ],
    }
  `);
});
