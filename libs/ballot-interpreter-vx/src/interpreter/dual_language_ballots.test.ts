import * as hamilton from '../../test/fixtures/election-5c6e578acf-state-of-hamilton-2020';
import { buildInterpreterWithFixtures } from '../../test/helpers/fixtures_to_templates';

test('dual language ballot', async () => {
  const { electionDefinition } = hamilton;
  const { interpreter } = await buildInterpreterWithFixtures({
    electionDefinition,
    fixtures: [hamilton.blankPage1],
    useFixtureMetadata: true,
  });

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
