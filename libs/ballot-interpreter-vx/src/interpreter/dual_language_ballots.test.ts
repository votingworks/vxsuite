import * as hamilton from '../../test/fixtures/election-5c6e578acf-state-of-hamilton-2020';
import { Interpreter } from '.';

test('dual language ballot', async () => {
  const { electionDefinition } = hamilton;
  const interpreter = new Interpreter({ electionDefinition });

  interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await hamilton.blankPage1.imageData(),
      await hamilton.blankPage1.metadata()
    )
  );

  const { ballot } = await interpreter.interpretBallot(
    await hamilton.filledInPage1.imageData()
  );
  expect(ballot.votes).toMatchInlineSnapshot(`
    Object {
      "president": Array [
        Object {
          "id": "barchi-hallaren",
          "name": "Joseph Barchi and Joseph Hallaren",
          "partyIds": Array [
            "0",
          ],
        },
      ],
      "representative-district-6": Array [
        Object {
          "id": "schott",
          "name": "Brad Schott",
          "partyIds": Array [
            "2",
          ],
        },
      ],
      "senator": Array [
        Object {
          "id": "brown",
          "name": "David Brown",
          "partyIds": Array [
            "6",
          ],
        },
      ],
    }
  `);
});
