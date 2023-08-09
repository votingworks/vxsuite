import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireAmherstFixtures,
  sampleBallotImages,
} from '@votingworks/fixtures';
import { assert, err, typedAs } from '@votingworks/basics';
import { SheetOf } from '@votingworks/types';
import { sliceElectionHash } from '@votingworks/ballot-encoder';
import { InterpretError, interpret } from './interpret';

test.each([
  [
    'front, back',
    electionFamousNames2021Fixtures.machineMarkedBallotPage1,
    electionFamousNames2021Fixtures.machineMarkedBallotPage2,
  ],
  [
    'back, front',
    electionFamousNames2021Fixtures.machineMarkedBallotPage2,
    electionFamousNames2021Fixtures.machineMarkedBallotPage1,
  ],
])('happy path: %s', async (name, front, back) => {
  const card: SheetOf<ImageData> = [
    await front.asImageData(),
    await back.asImageData(),
  ];
  const result = await interpret(
    electionFamousNames2021Fixtures.electionDefinition,
    card
  );
  const { ballot, summaryBallotImage, blankPageImage } = result.unsafeUnwrap();
  expect(ballot).toMatchInlineSnapshot(`
    {
      "ballotId": undefined,
      "ballotStyleId": "1",
      "ballotType": 0,
      "electionHash": "b4e07814b46911211ec7",
      "isTestMode": true,
      "precinctId": "23",
      "votes": {
        "attorney": [
          {
            "id": "john-snow",
            "name": "John Snow",
            "partyIds": [
              "1",
            ],
          },
        ],
        "board-of-alderman": [
          {
            "id": "helen-keller",
            "name": "Helen Keller",
            "partyIds": [
              "0",
            ],
          },
          {
            "id": "steve-jobs",
            "name": "Steve Jobs",
            "partyIds": [
              "1",
            ],
          },
          {
            "id": "nikola-tesla",
            "name": "Nikola Tesla",
            "partyIds": [
              "0",
            ],
          },
          {
            "id": "vincent-van-gogh",
            "name": "Vincent Van Gogh",
            "partyIds": [
              "1",
            ],
          },
        ],
        "chief-of-police": [
          {
            "id": "natalie-portman",
            "name": "Natalie Portman",
            "partyIds": [
              "0",
            ],
          },
        ],
        "city-council": [
          {
            "id": "marie-curie",
            "name": "Marie Curie",
            "partyIds": [
              "0",
            ],
          },
          {
            "id": "indiana-jones",
            "name": "Indiana Jones",
            "partyIds": [
              "1",
            ],
          },
          {
            "id": "mona-lisa",
            "name": "Mona Lisa",
            "partyIds": [
              "3",
            ],
          },
          {
            "id": "jackie-chan",
            "name": "Jackie Chan",
            "partyIds": [
              "3",
            ],
          },
        ],
        "controller": [
          {
            "id": "winston-churchill",
            "name": "Winston Churchill",
            "partyIds": [
              "0",
            ],
          },
        ],
        "mayor": [
          {
            "id": "sherlock-holmes",
            "name": "Sherlock Holmes",
            "partyIds": [
              "0",
            ],
          },
        ],
        "parks-and-recreation-director": [
          {
            "id": "charles-darwin",
            "name": "Charles Darwin",
            "partyIds": [
              "0",
            ],
          },
        ],
        "public-works-director": [
          {
            "id": "benjamin-franklin",
            "name": "Benjamin Franklin",
            "partyIds": [
              "0",
            ],
          },
        ],
      },
    }
  `);

  // don't use Jest `toEqual` matcher because it tries to pretty print the
  // ImageData objects, which is slow and causes the test to time out
  if (name === 'front, back') {
    assert(summaryBallotImage === card[0]);
    assert(blankPageImage === card[1]);
  } else {
    assert(summaryBallotImage === card[1]);
    assert(blankPageImage === card[0]);
  }
});

test('votes not found', async () => {
  const card: SheetOf<ImageData> = [
    await sampleBallotImages.blankPage.asImageData(),
    await sampleBallotImages.blankPage.asImageData(),
  ];
  const result = await interpret(
    electionFamousNames2021Fixtures.electionDefinition,
    card
  );
  expect(result).toEqual(
    err(
      typedAs<InterpretError>({
        type: 'votes-not-found',
        source: [{ type: 'blank-page' }, { type: 'blank-page' }],
      })
    )
  );
});

test('multiple QR codes', async () => {
  const card: SheetOf<ImageData> = [
    await electionFamousNames2021Fixtures.machineMarkedBallotPage1.asImageData(),
    await electionFamousNames2021Fixtures.machineMarkedBallotPage1.asImageData(),
  ];
  const result = await interpret(
    electionFamousNames2021Fixtures.electionDefinition,
    card
  );
  expect(result).toEqual(
    err(
      typedAs<InterpretError>({
        type: 'multiple-qr-codes',
        source: expect.anything(),
      })
    )
  );
});

test('mismatched election', async () => {
  const card: SheetOf<ImageData> = [
    await electionFamousNames2021Fixtures.machineMarkedBallotPage1.asImageData(),
    await electionFamousNames2021Fixtures.machineMarkedBallotPage2.asImageData(),
  ];
  const result = await interpret(
    electionGridLayoutNewHampshireAmherstFixtures.electionDefinition,
    card
  );
  expect(result).toEqual(
    err(
      typedAs<InterpretError>({
        type: 'mismatched-election',
        expectedElectionHash: sliceElectionHash(
          electionGridLayoutNewHampshireAmherstFixtures.electionDefinition
            .electionHash
        ),
        actualElectionHash: sliceElectionHash(
          electionFamousNames2021Fixtures.electionDefinition.electionHash
        ),
      })
    )
  );
});
