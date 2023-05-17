import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireAmherstFixtures,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { InvalidElectionHashPage, SheetOf, mapSheet } from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { typedAs } from '@votingworks/basics';
import { interpretSheet } from './interpret';

describe('VX BMD interpretation', () => {
  const fixtures = electionFamousNames2021Fixtures;
  const { electionDefinition } = fixtures;
  const bmdSummaryBallotPage = fixtures.machineMarkedBallotPage1.asFilePath();
  const bmdBlankPage = fixtures.machineMarkedBallotPage2.asFilePath();
  const validBmdSheet: SheetOf<string> = [bmdSummaryBallotPage, bmdBlankPage];

  test('extracts votes encoded in a QR code', async () => {
    const result = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: ALL_PRECINCTS_SELECTION,
        testMode: true,
      },
      validBmdSheet
    );
    expect(mapSheet(result, ({ interpretation }) => interpretation))
      .toMatchInlineSnapshot(`
          Array [
            Object {
              "ballotId": undefined,
              "metadata": Object {
                "ballotStyleId": "1",
                "ballotType": 0,
                "electionHash": "b4e07814b46911211ec7",
                "isTestMode": true,
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
            Object {
              "type": "BlankPage",
            },
          ]
      `);
  });

  test('properly detects test ballot in live mode', async () => {
    const interpretationResult = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: ALL_PRECINCTS_SELECTION,
        testMode: false, // this is the test mode
      },
      validBmdSheet
    );

    expect(interpretationResult[0].interpretation.type).toEqual(
      'InvalidTestModePage'
    );
  });

  test('properly detects bmd ballot with wrong precinct', async () => {
    const interpretationResult = await interpretSheet(
      {
        electionDefinition,
        testMode: true,
        precinctSelection: singlePrecinctSelectionFor('20'),
      },
      validBmdSheet
    );

    expect(interpretationResult[0].interpretation.type).toEqual(
      'InvalidPrecinctPage'
    );
  });

  test('properly detects bmd ballot with correct precinct', async () => {
    const interpretationResult = await interpretSheet(
      {
        electionDefinition,
        testMode: true,
        precinctSelection: singlePrecinctSelectionFor('23'),
      },
      validBmdSheet
    );

    expect(interpretationResult[0].interpretation.type).toEqual(
      'InterpretedBmdPage'
    );
  });

  test('properly detects a ballot with incorrect election hash', async () => {
    const interpretationResult = await interpretSheet(
      {
        electionDefinition: {
          ...electionSampleDefinition,
          electionHash: 'd34db33f',
        },
        testMode: true,
        precinctSelection: singlePrecinctSelectionFor('23'),
      },
      validBmdSheet
    );

    expect(interpretationResult[0].interpretation).toEqual(
      typedAs<InvalidElectionHashPage>({
        type: 'InvalidElectionHashPage',
        actualElectionHash: 'b4e07814b46911211ec7',
        expectedElectionHash: 'd34db33f',
      })
    );
  });

  test('properly identifies blank sheets', async () => {
    const interpretationResult = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: ALL_PRECINCTS_SELECTION,
        testMode: true,
      },
      [bmdBlankPage, bmdBlankPage]
    );

    expect(interpretationResult[0].interpretation.type).toEqual('BlankPage');
    expect(interpretationResult[1].interpretation.type).toEqual('BlankPage');
  });

  test('treats sheets with multiple QR codes as unreadable', async () => {
    const interpretationResult = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: ALL_PRECINCTS_SELECTION,
        testMode: true,
      },
      [bmdSummaryBallotPage, bmdSummaryBallotPage]
    );

    expect(interpretationResult[0].interpretation.type).toEqual(
      'UnreadablePage'
    );
    expect(interpretationResult[1].interpretation.type).toEqual(
      'UnreadablePage'
    );
  });
});

describe('NH HMPB interpretation', () => {
  const fixtures = electionGridLayoutNewHampshireAmherstFixtures;
  const { electionDefinition } = fixtures;
  const hmpbFront = fixtures.scanMarkedFront.asFilePath();
  const hmpbBack = fixtures.scanMarkedBack.asFilePath();
  const validHmpbSheet: SheetOf<string> = [hmpbFront, hmpbBack];

  test('properly interprets a valid HMPB', async () => {
    const interpretationResult = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: ALL_PRECINCTS_SELECTION,
        testMode: true,
      },
      validHmpbSheet
    );

    expect(
      mapSheet(
        interpretationResult,
        ({ interpretation }) => interpretation.type
      )
    ).toEqual(['InterpretedHmpbPage', 'InterpretedHmpbPage']);
  });

  test('fails to interpret a HMPB with wrong precinct', async () => {
    const interpretationResult = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor('20'),
        testMode: true,
      },
      validHmpbSheet
    );

    expect(
      mapSheet(
        interpretationResult,
        ({ interpretation }) => interpretation.type
      )
    ).toEqual(['InvalidPrecinctPage', 'InvalidPrecinctPage']);
  });
});
