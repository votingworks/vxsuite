import * as oaklawn from '../../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library';
import { Interpreter } from '.';

jest.setTimeout(10000);

test('interpret empty ballot', async () => {
  const fixtures = oaklawn;
  const { electionDefinition } = fixtures;
  const interpreter = new Interpreter({ electionDefinition });

  await expect(
    interpreter.interpretBallot(await fixtures.blankPage1.imageData())
  ).rejects.toThrow(
    'Cannot scan ballot because not all required templates have been added'
  );
  const p1 = interpreter.addTemplate(
    await interpreter.interpretTemplate(await fixtures.blankPage1.imageData())
  );
  interpreter.addTemplate(
    await interpreter.interpretTemplate(await fixtures.blankPage2.imageData())
  );

  const { matchedTemplate, mappedBallot, metadata, ballot } =
    await interpreter.interpretBallot(await fixtures.blankPage1.imageData());
  expect(matchedTemplate === p1).toBe(true);
  expect(mappedBallot.width).toBe(matchedTemplate.imageData.width);
  expect(mappedBallot.height).toBe(matchedTemplate.imageData.height);
  expect(metadata.ballotStyleId).toEqual(
    p1.ballotPageLayout.metadata.ballotStyleId
  );
  expect(ballot.votes).toEqual({});
});
