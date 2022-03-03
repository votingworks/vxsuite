import * as hamilton from '../test/fixtures/election-5c6e578acf-state-of-hamilton-2020';
import { Interpreter } from './interpreter';

jest.setTimeout(10000);

/**
 * TODO: Enable this test when contest box identification improves.
 *
 * At the moment we look for contest boxes by finding contiguous dark pixels
 * that are roughly the expected dimensions for a contest. Unfortunately, if
 * someone draws lines connecting boxes then we can't distinguish them.
 */
test.skip('handles lines connecting contest boxes', async () => {
  const { election } = hamilton;
  const interpreter = new Interpreter({ election });

  await interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await hamilton.blankPage1.imageData(),
      await hamilton.blankPage1.metadata()
    )
  );
  await interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await hamilton.blankPage2.imageData(),
      await hamilton.blankPage2.metadata()
    )
  );
  await interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await hamilton.blankPage3.imageData(),
      await hamilton.blankPage3.metadata()
    )
  );

  const { ballot } = await interpreter.interpretBallot(
    await hamilton.filledInPage3.imageData()
  );
  expect(ballot.votes).toMatchInlineSnapshot();
});
