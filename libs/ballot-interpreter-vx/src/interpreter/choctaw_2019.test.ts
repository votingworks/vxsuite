import * as choctaw2019 from '../../test/fixtures/election-98f5203139-choctaw-general-2019';
import { Interpreter } from '.';

test('choctaw general 2019', async () => {
  const { electionDefinition } = choctaw2019;
  const interpreter = new Interpreter({ electionDefinition });

  interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await choctaw2019.blankPage1.imageData(),
      await choctaw2019.blankPage1.metadata()
    )
  );
  interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await choctaw2019.blankPage2.imageData(),
      await choctaw2019.blankPage2.metadata()
    )
  );

  expect(
    (
      await interpreter.interpretBallot(
        await choctaw2019.filledInPage1.imageData(),
        await choctaw2019.filledInPage1.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "575020970": Array [
        Object {
          "id": "575031910",
          "name": "Andy Gipson",
          "partyIds": Array [
            "3",
          ],
        },
      ],
      "575020972": Array [
        Object {
          "id": "575031914",
          "name": "Delbert Hosemann",
          "partyIds": Array [
            "3",
          ],
        },
      ],
      "575020973": Array [
        Object {
          "id": "575031916",
          "name": "Johnny DuPree",
          "partyIds": Array [
            "2",
          ],
        },
      ],
      "575020974": Array [
        Object {
          "id": "575031918",
          "name": "Shad White",
          "partyIds": Array [
            "3",
          ],
        },
      ],
      "575020975": Array [
        Object {
          "id": "575031919",
          "name": "Addie Lee Green",
          "partyIds": Array [
            "2",
          ],
        },
      ],
      "575021151": Array [
        Object {
          "id": "575032127",
          "name": "Lynn Fitch",
          "partyIds": Array [
            "3",
          ],
        },
      ],
      "575021152": Array [
        Object {
          "id": "575030384",
          "name": "Bob Hickingbottom",
          "partyIds": Array [
            "8",
          ],
        },
      ],
    }
  `);

  expect(
    (
      await interpreter.interpretBallot(
        await choctaw2019.filledInPage2.imageData(),
        await choctaw2019.filledInPage2.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "575020971": Array [
        Object {
          "id": "575031912",
          "name": "Mike Chaney",
          "partyIds": Array [
            "3",
          ],
        },
      ],
      "575021144": Array [
        Object {
          "id": "575032121",
          "name": "Brandon Presley",
          "partyIds": Array [
            "2",
          ],
        },
      ],
      "575021153": Array [
        Object {
          "id": "575032131",
          "name": "John Caldwell",
          "partyIds": Array [
            "3",
          ],
        },
      ],
      "575021524": Array [
        Object {
          "id": "575032576",
          "name": "Steve Montgomery",
          "partyIds": Array [
            "2",
          ],
        },
      ],
    }
  `);
});

test('determining layout of a ballot with borders', async () => {
  const { electionDefinition } = choctaw2019;
  const interpreter = new Interpreter({ electionDefinition });

  interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await choctaw2019.blankPage1.imageData(),
      await choctaw2019.blankPage1.metadata()
    )
  );

  interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await choctaw2019.blankPage2.imageData(),
      await choctaw2019.blankPage2.metadata()
    )
  );

  interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await choctaw2019.blankPage3.imageData(),
      await choctaw2019.blankPage3.metadata()
    )
  );

  expect(
    (
      await interpreter.interpretBallot(
        await choctaw2019.borderPage1.imageData(),
        await choctaw2019.blankPage1.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`Object {}`);

  expect(
    (
      await interpreter.interpretBallot(
        await choctaw2019.borderPage3.imageData(),
        await choctaw2019.blankPage3.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`Object {}`);
});
