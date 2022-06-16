import * as oaklawn from '../../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library';
import { Interpreter } from '.';

jest.setTimeout(10000);

test('regression: page outline', async () => {
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

  const { ballot } = await interpreter.interpretBallot(
    await fixtures.partialBorderPage2.imageData()
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
});
