import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { assert } from '@votingworks/basics';
import { SheetOf } from '@votingworks/types';
import { interpret } from './interpret';

test('happy path', async () => {
  const card: SheetOf<ImageData> = [
    await electionFamousNames2021Fixtures.machineMarkedBallotPage1.asImageData(),
    await electionFamousNames2021Fixtures.machineMarkedBallotPage2.asImageData(),
  ];
  const result = await interpret(
    electionFamousNames2021Fixtures.electionDefinition,
    card
  );
  const { ballot, normalizedImages } = result.unsafeUnwrap();
  expect(ballot).toMatchInlineSnapshot(`
    Object {
      "ballotId": undefined,
      "ballotStyleId": "1",
      "ballotType": 0,
      "electionHash": "11442cf380df2e505d14",
      "isTestMode": true,
      "precinctId": "23",
      "votes": Object {
        "attorney": Array [
          Object {
            "id": "john-snow",
            "name": "John Snow",
            "partyIds": Array [
              "1",
            ],
          },
        ],
        "board-of-alderman": Array [
          Object {
            "id": "helen-keller",
            "name": "Helen Keller",
            "partyIds": Array [
              "0",
            ],
          },
          Object {
            "id": "steve-jobs",
            "name": "Steve Jobs",
            "partyIds": Array [
              "1",
            ],
          },
          Object {
            "id": "nikola-tesla",
            "name": "Nikola Tesla",
            "partyIds": Array [
              "0",
            ],
          },
          Object {
            "id": "vincent-van-gogh",
            "name": "Vincent Van Gogh",
            "partyIds": Array [
              "1",
            ],
          },
        ],
        "chief-of-police": Array [
          Object {
            "id": "natalie-portman",
            "name": "Natalie Portman",
            "partyIds": Array [
              "0",
            ],
          },
        ],
        "city-council": Array [
          Object {
            "id": "marie-curie",
            "name": "Marie Curie",
            "partyIds": Array [
              "0",
            ],
          },
          Object {
            "id": "indiana-jones",
            "name": "Indiana Jones",
            "partyIds": Array [
              "1",
            ],
          },
          Object {
            "id": "mona-lisa",
            "name": "Mona Lisa",
            "partyIds": Array [
              "3",
            ],
          },
          Object {
            "id": "jackie-chan",
            "name": "Jackie Chan",
            "partyIds": Array [
              "3",
            ],
          },
        ],
        "controller": Array [
          Object {
            "id": "winston-churchill",
            "name": "Winston Churchill",
            "partyIds": Array [
              "0",
            ],
          },
        ],
        "mayor": Array [
          Object {
            "id": "sherlock-holmes",
            "name": "Sherlock Holmes",
            "partyIds": Array [
              "0",
            ],
          },
        ],
        "parks-and-recreation-director": Array [
          Object {
            "id": "charles-darwin",
            "name": "Charles Darwin",
            "partyIds": Array [
              "0",
            ],
          },
        ],
        "public-works-director": Array [
          Object {
            "id": "benjamin-franklin",
            "name": "Benjamin Franklin",
            "partyIds": Array [
              "0",
            ],
          },
        ],
      },
    }
  `);

  // don't use Jest `toEqual` matcher because it tries to pretty print the
  // ImageData objects, which is slow and causes the test to time out
  assert(normalizedImages[0] === card[0]);
  assert(normalizedImages[1] === card[1]);
});
