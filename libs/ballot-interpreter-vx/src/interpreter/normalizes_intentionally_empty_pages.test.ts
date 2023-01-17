import * as choctaw2020Special from '../../test/fixtures/choctaw-2020-09-22-f30480cc99';
import { Interpreter } from '.';

test('normalizes intentionally-empty pages correctly', async () => {
  const fixtures = choctaw2020Special;
  const { electionDefinition } = fixtures;
  const interpreter = new Interpreter({ electionDefinition });

  interpreter.addTemplate(
    await interpreter.interpretTemplate(await fixtures.blankPage1.imageData())
  );
  const page2Template = interpreter.addTemplate(
    await interpreter.interpretTemplate(await fixtures.blankPage2.imageData())
  );
  const { mappedBallot } = await interpreter.interpretBallot(
    await fixtures.absenteePage2.imageData()
  );

  // there was a bug where all pixels were white
  expect(mappedBallot.data.some((px) => px !== 0xff)).toEqual(true);

  // ensure the size is the same as the template
  expect(mappedBallot.width).toEqual(page2Template.imageData.width);
  expect(mappedBallot.height).toEqual(page2Template.imageData.height);
});
