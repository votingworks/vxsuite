import {
  electionFamousNames2021Fixtures,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { InvalidElectionHashPage, mapSheet, SheetOf } from '@votingworks/types';
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
      [
        {
          "ballotId": undefined,
          "metadata": {
            "ballotStyleId": "1",
            "ballotType": 0,
            "electionHash": "b4e07814b46911211ec7",
            "isTestMode": true,
            "precinctId": "23",
          },
          "type": "InterpretedBmdPage",
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
        },
        {
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
