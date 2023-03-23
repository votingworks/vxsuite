import {
  electionDefinition,
  blankPage1,
  blankPage2,
  filledInPage1,
  filledInPage2,
} from '../../test/fixtures/right-side-target-mark-position';
import { buildInterpreterWithFixtures } from '../../test/helpers/fixtures_to_templates';

// TODO Skipping for now, since we're relying on an outdated election fixture
// that includes an either-neither contest
test.skip('interprets ballots with right-side ballot target mark position', async () => {
  const { interpreter } = await buildInterpreterWithFixtures({
    electionDefinition,
    fixtures: [blankPage1, blankPage2],
    testMode: true,
  });

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
