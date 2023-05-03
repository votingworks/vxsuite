import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireAmherstFixtures,
  electionSampleDefinition,
  sampleBallotImages,
} from '@votingworks/fixtures';
import { InvalidElectionHashPage } from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { typedAs } from '@votingworks/basics';
import { interpretSheet } from './interpret_sheet';

test('extracts votes encoded in a QR code', async () => {
  const ballotImagePath =
    electionFamousNames2021Fixtures.machineMarkedBallotPage1.asFilePath();
  expect(
    await interpretSheet(
      {
        electionDefinition: electionFamousNames2021Fixtures.electionDefinition,
        precinctSelection: ALL_PRECINCTS_SELECTION,
        testMode: true,
      },
      [ballotImagePath, sampleBallotImages.blankPage.asFilePath()]
    )
  ).toMatchInlineSnapshot(`
    Array [
      Object {
        "interpretation": Object {
          "ballotId": undefined,
          "metadata": Object {
            "ballotStyleId": "1",
            "ballotType": 0,
            "electionHash": "11442cf380df2e505d14",
            "isTestMode": true,
            "locales": Object {
              "primary": "en-US",
            },
            "precinctId": "23",
          },
          "type": "InterpretedBmdPage",
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
        },
      },
      Object {
        "interpretation": Object {
          "type": "BlankPage",
        },
      },
    ]
  `);
});

test('properly detects test ballot in live mode', async () => {
  const ballotImagePath =
    electionFamousNames2021Fixtures.machineMarkedBallotPage1.asFilePath();
  const interpretationResult = await interpretSheet(
    {
      electionDefinition: electionFamousNames2021Fixtures.electionDefinition,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      testMode: false, // this is the test mode
    },
    [ballotImagePath, sampleBallotImages.blankPage.asFilePath()]
  );

  expect(interpretationResult[0].interpretation.type).toEqual(
    'InvalidTestModePage'
  );
});

test('properly detects bmd ballot with wrong precinct', async () => {
  const ballotImagePath =
    electionFamousNames2021Fixtures.machineMarkedBallotPage1.asFilePath();
  const interpretationResult = await interpretSheet(
    {
      electionDefinition: electionFamousNames2021Fixtures.electionDefinition,
      testMode: true,
      precinctSelection: singlePrecinctSelectionFor('20'),
    },
    [ballotImagePath, sampleBallotImages.blankPage.asFilePath()]
  );

  expect(interpretationResult[0].interpretation.type).toEqual(
    'InvalidPrecinctPage'
  );
});

test('properly detects bmd ballot with correct precinct', async () => {
  const ballotImagePath =
    electionFamousNames2021Fixtures.machineMarkedBallotPage1.asFilePath();
  const interpretationResult = await interpretSheet(
    {
      electionDefinition: electionFamousNames2021Fixtures.electionDefinition,
      testMode: true,
      precinctSelection: singlePrecinctSelectionFor('23'),
    },
    [ballotImagePath, sampleBallotImages.blankPage.asFilePath()]
  );

  expect(interpretationResult[0].interpretation.type).toEqual(
    'InterpretedBmdPage'
  );
});

test('properly detects a ballot with incorrect election hash', async () => {
  const ballotImagePath =
    electionFamousNames2021Fixtures.machineMarkedBallotPage1.asFilePath();
  const interpretationResult = await interpretSheet(
    {
      electionDefinition: {
        ...electionSampleDefinition,
        electionHash: 'd34db33f',
      },
      testMode: true,
      precinctSelection: singlePrecinctSelectionFor('23'),
    },
    [ballotImagePath, sampleBallotImages.blankPage.asFilePath()]
  );

  expect(interpretationResult[0].interpretation).toEqual(
    typedAs<InvalidElectionHashPage>({
      type: 'InvalidElectionHashPage',
      actualElectionHash: '11442cf380df2e505d14',
      expectedElectionHash: 'd34db33f',
    })
  );
});

test('treats blank sheets as unreadable', async () => {
  const interpretationResult = await interpretSheet(
    {
      electionDefinition:
        electionGridLayoutNewHampshireAmherstFixtures.electionDefinition,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      testMode: true,
    },
    [
      sampleBallotImages.blankPage.asFilePath(),
      sampleBallotImages.blankPage.asFilePath(),
    ]
  );

  expect(interpretationResult[0].interpretation.type).toEqual('UnreadablePage');
  expect(interpretationResult[1].interpretation.type).toEqual('UnreadablePage');
});
