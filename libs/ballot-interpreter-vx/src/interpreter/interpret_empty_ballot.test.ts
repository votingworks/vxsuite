import { iter } from '@votingworks/basics';
import * as oaklawn from '../../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library';
import { Interpreter } from '.';
import { fixturesToTemplates } from '../../test/helpers/fixtures_to_templates';

test('interpret empty ballot', async () => {
  const fixtures = oaklawn;
  const { electionDefinition } = fixtures;
  const interpreter = new Interpreter({ electionDefinition });

  await expect(
    interpreter.interpretBallot(await fixtures.blankPage1.imageData())
  ).rejects.toThrow(
    'Cannot scan ballot because not all required templates have been added'
  );

  const templates = await iter(
    fixturesToTemplates({
      electionDefinition,
      fixtures: [fixtures.blankPage1, fixtures.blankPage2],
      useFixtureMetadata: false,
    })
  )
    .map((template) => interpreter.addTemplate(template))
    .toArray();
  const p1 = templates[0];
  const { matchedTemplate, mappedBallot, metadata, ballot } =
    await interpreter.interpretBallot(await fixtures.blankPage1.imageData());
  expect(matchedTemplate === p1).toEqual(true);
  expect(mappedBallot.width).toEqual(matchedTemplate.imageData.width);
  expect(mappedBallot.height).toEqual(matchedTemplate.imageData.height);
  expect(metadata.ballotStyleId).toEqual(
    p1.ballotPageLayout.metadata.ballotStyleId
  );
  expect(ballot.votes).toEqual({});
});
