import * as m14Mock from '../../test/fixtures/election-60bfbea106-m14-mock';
import { Interpreter } from '.';

test('does not bail out with 7x7 jiggle', async () => {
  const fixtures = m14Mock;
  const { electionDefinition } = fixtures;
  const interpreter = new Interpreter({ electionDefinition });

  interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await fixtures.templatePage1.imageData()
    )
  );

  interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await fixtures.templatePage2.imageData()
    )
  );

  const { ballot } = await interpreter.interpretBallot(
    await fixtures.page1.imageData()
  );

  expect(ballot.votes).toMatchInlineSnapshot(`
    Object {
      "chancerycourt-9-1": Array [
        Object {
          "id": "chancery-1-1",
          "name": "Bennie L. Richard",
        },
      ],
      "chancerycourt-9-2": Array [
        Object {
          "id": "chancery-2-1",
          "name": "Renia A. Anderson",
        },
      ],
      "chancerycourt-9-3": Array [
        Object {
          "id": "chancery-3-1",
          "name": "Vicki Roach Barnes",
        },
      ],
      "circuit-9-1": Array [
        Object {
          "id": "circuit-1-1",
          "name": "Toni Walker",
        },
      ],
      "circuit-9-2": Array [
        Object {
          "id": "circuit-2-1",
          "name": "M. James (Jim) Chaney, Jr.",
        },
      ],
      "congress": Array [
        Object {
          "id": "congress-2",
          "name": "Brian Flowers",
          "partyIds": Array [
            "3",
          ],
        },
      ],
      "courtappeals": Array [
        Object {
          "id": "courtappeals-1",
          "name": "Bruce W. Burton",
        },
      ],
      "warren-judge": Array [
        Object {
          "id": "warren-judge-4",
          "name": "Foo Bar Four",
        },
      ],
    }
  `);
});

test('bails out with 5x5 jiggle', async () => {
  const fixtures = m14Mock;
  const { electionDefinition } = fixtures;
  const interpreter = new Interpreter({ electionDefinition });

  interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await fixtures.templatePage1.imageData()
    )
  );

  interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await fixtures.templatePage2.imageData()
    )
  );

  await expect(async () => {
    await interpreter.interpretBallot(
      await fixtures.page1.imageData(),
      undefined,
      { maximumCorrectionPixelsX: 5, maximumCorrectionPixelsY: 5 }
    );
  }).rejects.toThrow(Error);
});
