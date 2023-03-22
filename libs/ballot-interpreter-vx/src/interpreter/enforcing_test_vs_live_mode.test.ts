import { Interpreter } from '.';
import * as oaklawn from '../../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library';
import { buildInterpreterWithFixtures } from '../../test/helpers/fixtures_to_templates';
import { interpretTemplate } from '../layout';

test('enforcing test vs live mode', async () => {
  const fixtures = oaklawn;
  const { electionDefinition } = fixtures;
  const interpreter = new Interpreter({ electionDefinition });
  const templatePage1 = await interpretTemplate({
    electionDefinition,
    imageData: await fixtures.blankPage1.imageData(),
    metadata: await fixtures.blankPage1.metadata({ isTestMode: true }),
    contestOffset: 0,
  });

  expect(() => interpreter.addTemplate(templatePage1)).toThrowError(
    'interpreter configured with testMode=false cannot add templates with isTestMode=true'
  );

  await expect(
    (
      await buildInterpreterWithFixtures({
        electionDefinition,
        fixtures: [fixtures.blankPage1, fixtures.blankPage2],
      })
    ).interpretBallot(
      await fixtures.blankPage1.imageData(),
      await fixtures.blankPage1.metadata({ isTestMode: true })
    )
  ).rejects.toThrowError(
    'interpreter configured with testMode=false cannot interpret ballots with isTestMode=true'
  );
});
