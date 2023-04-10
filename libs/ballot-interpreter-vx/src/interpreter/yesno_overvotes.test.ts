import * as hamilton from '../../test/fixtures/election-5c6e578acf-state-of-hamilton-2020';
import { buildInterpreterWithFixtures } from '../../test/helpers/fixtures_to_templates';

test('yesno overvotes', async () => {
  const { electionDefinition } = hamilton;
  const { interpreter } = await buildInterpreterWithFixtures({
    electionDefinition,
    fixtures: [
      hamilton.blankPage1,
      hamilton.blankPage2,
      hamilton.blankPage3,
      hamilton.blankPage4,
      hamilton.blankPage5,
    ],
    useFixtureMetadata: true,
  });

  const { ballot } = await interpreter.interpretBallot(
    await hamilton.filledInPage5YesNoOvervote.imageData()
  );
  expect(ballot.votes).toMatchInlineSnapshot(`
    Object {
      "102": Array [
        "yes",
      ],
      "measure-101": Array [
        "no",
      ],
      "proposition-1": Array [
        "yes",
        "no",
      ],
    }
  `);
});
