import * as oaklawn from '../../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library';
import { Interpreter } from '.';

jest.setTimeout(10000);

test('enforcing test vs live mode', async () => {
  const fixtures = oaklawn;
  const { electionDefinition } = fixtures;
  const interpreter = new Interpreter({ electionDefinition });
  const template = await interpreter.interpretTemplate(
    await fixtures.blankPage1.imageData(),
    await fixtures.blankPage1.metadata({ isTestMode: true })
  );

  expect(() => interpreter.addTemplate(template)).toThrowError(
    'interpreter configured with testMode=false cannot add templates with isTestMode=true'
  );

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

  await expect(
    interpreter.interpretBallot(
      await fixtures.blankPage1.imageData(),
      await fixtures.blankPage1.metadata({ isTestMode: true })
    )
  ).rejects.toThrowError(
    'interpreter configured with testMode=false cannot interpret ballots with isTestMode=true'
  );
});
