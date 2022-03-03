import * as hamilton from '../test/fixtures/election-5c6e578acf-state-of-hamilton-2020';
import { Interpreter } from './interpreter';

jest.setTimeout(10000);

test('yesno overvotes', async () => {
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
  await interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await hamilton.blankPage4.imageData(),
      await hamilton.blankPage4.metadata()
    )
  );
  await interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await hamilton.blankPage5.imageData(),
      await hamilton.blankPage5.metadata()
    )
  );

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
