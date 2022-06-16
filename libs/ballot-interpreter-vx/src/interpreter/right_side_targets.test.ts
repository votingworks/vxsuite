import { Interpreter } from '.';
import {
  electionDefinition,
  blankPage1,
  blankPage2,
  filledInPage1,
  filledInPage2,
} from '../../test/fixtures/right-side-target-mark-position';

test('interprets ballots with right-side ballot target mark position', async () => {
  const interpreter = new Interpreter({ electionDefinition, testMode: true });

  interpreter.addTemplate(
    await interpreter.interpretTemplate(await blankPage1.imageData())
  );
  interpreter.addTemplate(
    await interpreter.interpretTemplate(await blankPage2.imageData())
  );

  expect(
    (await interpreter.interpretBallot(await filledInPage1.imageData())).ballot
      .votes
  ).toMatchInlineSnapshot(`
    Object {
      "best-animal-mammal": Array [
        Object {
          "id": "otter",
          "name": "Otter",
          "partyIds": Array [
            "0",
          ],
        },
      ],
      "zoo-council-mammal": Array [
        Object {
          "id": "zebra",
          "name": "Zebra",
          "partyIds": Array [
            "0",
          ],
        },
        Object {
          "id": "kangaroo",
          "name": "Kangaroo",
          "partyIds": Array [
            "0",
          ],
        },
        Object {
          "id": "write-in-1",
          "isWriteIn": true,
          "name": "Write-In",
        },
      ],
    }
  `);
  expect(
    (await interpreter.interpretBallot(await filledInPage2.imageData())).ballot
      .votes
  ).toMatchInlineSnapshot(`
    Object {
      "new-zoo-either": Array [
        "yes",
      ],
      "new-zoo-pick": Array [
        "yes",
      ],
    }
  `);
});
