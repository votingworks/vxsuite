import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { Interpreter } from '.';

test('stretched precinct scanner ballot', async () => {
  const fixtures = electionFamousNames2021Fixtures;
  const { electionDefinition } = fixtures;
  const interpreter = new Interpreter({ electionDefinition });

  interpreter.addTemplate(
    await interpreter.interpretTemplate(await fixtures.blankPage1AsImageData())
  );
  interpreter.addTemplate(
    await interpreter.interpretTemplate(await fixtures.blankPage2AsImageData())
  );

  await expect(async () => {
    await interpreter.interpretBallot(
      await fixtures.markedPrecinctScannerStretchPage2AsImageData()
    );
  }).rejects.toThrow();
});
