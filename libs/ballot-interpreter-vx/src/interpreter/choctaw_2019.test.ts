import * as choctaw2019 from '../../test/fixtures/election-98f5203139-choctaw-general-2019';
import { Interpreter } from '.';

jest.setTimeout(10000);

test('choctaw general 2019', async () => {
  const { election } = choctaw2019;
  const interpreter = new Interpreter({ election });

  await interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await choctaw2019.blankPage1.imageData(),
      await choctaw2019.blankPage1.metadata()
    )
  );
  await interpreter.addTemplate(
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
          "partyId": "3",
        },
      ],
      "575020972": Array [
        Object {
          "id": "575031914",
          "name": "Delbert Hosemann",
          "partyId": "3",
        },
      ],
      "575020973": Array [
        Object {
          "id": "575031916",
          "name": "Johnny DuPree",
          "partyId": "2",
        },
      ],
      "575020974": Array [
        Object {
          "id": "575031918",
          "name": "Shad White",
          "partyId": "3",
        },
      ],
      "575020975": Array [
        Object {
          "id": "575031919",
          "name": "Addie Lee Green",
          "partyId": "2",
        },
      ],
      "575021151": Array [
        Object {
          "id": "575032127",
          "name": "Lynn Fitch",
          "partyId": "3",
        },
      ],
      "575021152": Array [
        Object {
          "id": "575030384",
          "name": "Bob Hickingbottom",
          "partyId": "8",
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
          "partyId": "3",
        },
      ],
      "575021144": Array [
        Object {
          "id": "575032121",
          "name": "Brandon Presley",
          "partyId": "2",
        },
      ],
      "575021153": Array [
        Object {
          "id": "575032131",
          "name": "John Caldwell",
          "partyId": "3",
        },
      ],
      "575021524": Array [
        Object {
          "id": "575032576",
          "name": "Steve Montgomery",
          "partyId": "2",
        },
      ],
    }
  `);
});

test('determining layout of a ballot with borders', async () => {
  const { election } = choctaw2019;
  const interpreter = new Interpreter({ election });

  await interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await choctaw2019.blankPage1.imageData(),
      await choctaw2019.blankPage1.metadata()
    )
  );

  await interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await choctaw2019.blankPage2.imageData(),
      await choctaw2019.blankPage2.metadata()
    )
  );

  await interpreter.addTemplate(
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
