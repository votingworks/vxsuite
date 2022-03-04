import * as choctaw2020LegalSize from '../../test/fixtures/choctaw-county-2020-general-election';
import { Interpreter } from '.';

jest.setTimeout(10000);

test('regression: overvote on choctaw county p1-05', async () => {
  const fixtures = choctaw2020LegalSize;
  const { election } = fixtures;
  const interpreter = new Interpreter({ election, testMode: true });

  await interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await fixtures.district5BlankPage1.imageData()
    )
  );
  const interpretation = await interpreter.interpretBallot(
    await fixtures.filledInPage1_05.imageData()
  );

  expect(interpretation.marks.map((mark) => [mark.score, mark.optionId]))
    .toMatchInlineSnapshot(`
    Array [
      Array [
        0.0053475935828877,
        "775032091",
      ],
      Array [
        0,
        "775032092",
      ],
      Array [
        0.002717391304347826,
        "775032126",
      ],
      Array [
        0,
        "775032100",
      ],
      Array [
        0.005434782608695652,
        "775032096",
      ],
      Array [
        0.8913043478260869,
        "775032099",
      ],
      Array [
        0,
        "775032102",
      ],
      Array [
        0,
        "775032117",
      ],
      Array [
        0.005434782608695652,
        "775032098",
      ],
      Array [
        0,
        "__write-in-0",
      ],
      Array [
        0,
        "775032093",
      ],
      Array [
        0.008152173913043478,
        "775032094",
      ],
      Array [
        0.8913043478260869,
        "775032105",
      ],
      Array [
        0,
        "__write-in-0",
      ],
      Array [
        0,
        "775032084",
      ],
      Array [
        0.8913043478260869,
        "775032085",
      ],
      Array [
        0,
        "__write-in-0",
      ],
      Array [
        0.002717391304347826,
        "775032082",
      ],
      Array [
        0.8913043478260869,
        "775032110",
      ],
      Array [
        0.00267379679144385,
        "__write-in-0",
      ],
      Array [
        0.8983957219251337,
        "775032689",
      ],
      Array [
        0.008152173913043478,
        "__write-in-0",
      ],
      Array [
        0.8913043478260869,
        "775032690",
      ],
      Array [
        0,
        "__write-in-0",
      ],
    ]
  `);
  expect(interpretation.ballot.votes).toMatchInlineSnapshot(`
    Object {
      "775020890": Array [
        Object {
          "id": "775032110",
          "name": "Percy L. Lynchard",
          "partyId": "12",
        },
      ],
      "775020892": Array [
        Object {
          "id": "775032085",
          "name": "Trent Kelly",
          "partyId": "3",
        },
      ],
      "775020896": Array [
        Object {
          "id": "775032099",
          "name": "Presidential Electors for Howie Hawkins for President and Angela Nicole Walker for Vice President",
          "partyId": "9",
        },
      ],
      "775020897": Array [
        Object {
          "id": "775032105",
          "name": "Jimmy L. Edwards",
          "partyId": "4",
        },
      ],
      "775021420": Array [
        Object {
          "id": "775032689",
          "name": "Wayne McLeod",
        },
      ],
      "775021421": Array [
        Object {
          "id": "775032690",
          "name": "Michael D Thomas",
        },
      ],
    }
  `);
});
