import * as hamilton from '../../test/fixtures/election-5c6e578acf-state-of-hamilton-2020';
import { buildInterpreterWithFixtures } from '../../test/helpers/fixtures_to_templates';

/**
 * TODO: Enable this test when contest box identification improves.
 *
 * At the moment we look for contest boxes by finding contiguous dark pixels
 * that are roughly the expected dimensions for a contest. Unfortunately, if
 * someone draws lines connecting boxes then we can't distinguish them.
 */
test.skip('handles lines connecting contest boxes', async () => {
  const { electionDefinition } = hamilton;
  const { interpreter } = await buildInterpreterWithFixtures({
    electionDefinition,
    fixtures: [hamilton.blankPage1, hamilton.blankPage2, hamilton.blankPage3],
  });

  const { ballot } = await interpreter.interpretBallot(
    await hamilton.filledInPage3.imageData()
  );
  expect(ballot.votes).toMatchInlineSnapshot();
});
