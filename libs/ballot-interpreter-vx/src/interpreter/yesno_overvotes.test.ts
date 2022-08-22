import * as hamilton from '../../test/fixtures/election-5c6e578acf-state-of-hamilton-2020';
import { Interpreter } from '.';

test('yesno overvotes', async () => {
  const { electionDefinition } = hamilton;
  const interpreter = new Interpreter({ electionDefinition });

  interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await hamilton.blankPage1.imageData(),
      await hamilton.blankPage1.metadata()
    )
  );
  interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await hamilton.blankPage2.imageData(),
      await hamilton.blankPage2.metadata()
    )
  );
  interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await hamilton.blankPage3.imageData(),
      await hamilton.blankPage3.metadata()
    )
  );
  interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await hamilton.blankPage4.imageData(),
      await hamilton.blankPage4.metadata()
    )
  );
  interpreter.addTemplate(
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
