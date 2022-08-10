import * as choctaw2020LegalSize from '../../test/fixtures/choctaw-county-2020-general-election';
import { Interpreter } from '.';

jest.setTimeout(10000);

// disabling this test as we've disabled jsQR for now
test.skip('regression: overvote on choctaw county p1-05', async () => {
  const fixtures = choctaw2020LegalSize;
  const { electionDefinition } = fixtures;
  const interpreter = new Interpreter({ electionDefinition, testMode: true });

  interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await fixtures.district5BlankPage1.imageData()
    )
  );
  const interpretation = await interpreter.interpretBallot(
    await fixtures.p1BestCaseScenario.imageData()
  );

  expect(interpretation.marks.map((mark) => [mark.score, mark.optionId]))
    .toMatchInlineSnapshot(`
    Array [
      Array [
        0,
        "775032091",
      ],
      Array [
        0,
        "775032092",
      ],
      Array [
        0,
        "775032126",
      ],
      Array [
        0.0026595744680851063,
        "775032100",
      ],
      Array [
        0.015957446808510637,
        "775032096",
      ],
      Array [
        0.568,
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
        0,
        "775032098",
      ],
      Array [
        0,
        "write-in-0",
      ],
      Array [
        0.005319148936170213,
        "775032093",
      ],
      Array [
        0,
        "775032094",
      ],
      Array [
        0.5238095238095238,
        "775032105",
      ],
      Array [
        0.0026666666666666666,
        "write-in-0",
      ],
      Array [
        0.002631578947368421,
        "775032084",
      ],
      Array [
        0.6587926509186351,
        "775032085",
      ],
      Array [
        0,
        "write-in-0",
      ],
      Array [
        0.016216216216216217,
        "775032082",
      ],
      Array [
        0.7024128686327078,
        "775032110",
      ],
      Array [
        0,
        "write-in-0",
      ],
      Array [
        0.7681940700808625,
        "775032689",
      ],
      Array [
        0,
        "write-in-0",
      ],
      Array [
        0.774798927613941,
        "775032690",
      ],
      Array [
        0.002680965147453083,
        "write-in-0",
      ],
    ]
  `);
  expect(interpretation.ballot.votes).toMatchInlineSnapshot(`
    Object {
      "775020890": Array [
        Object {
          "id": "775032110",
          "name": "Percy L. Lynchard",
          "partyIds": Array [
            "12",
          ],
        },
      ],
      "775020892": Array [
        Object {
          "id": "775032085",
          "name": "Trent Kelly",
          "partyIds": Array [
            "3",
          ],
        },
      ],
      "775020896": Array [
        Object {
          "id": "775032099",
          "name": "Presidential Electors for Howie Hawkins for President and Angela Nicole Walker for Vice President",
          "partyIds": Array [
            "9",
          ],
        },
      ],
      "775020897": Array [
        Object {
          "id": "775032105",
          "name": "Jimmy L. Edwards",
          "partyIds": Array [
            "4",
          ],
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
