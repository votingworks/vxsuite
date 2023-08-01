import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireAmherstFixtures,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import {
  AdjudicationReason,
  InvalidElectionHashPage,
  SheetOf,
  mapSheet,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { assert, typedAs } from '@votingworks/basics';
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

describe('NH HMPB interpretation', () => {
  const fixtures = electionGridLayoutNewHampshireAmherstFixtures;
  const { electionDefinition } = fixtures;
  const hmpbFront = fixtures.scanMarkedFront.asFilePath();
  const hmpbBack = fixtures.scanMarkedBack.asFilePath();
  const hmpbFrontUnmarkedWriteIns =
    fixtures.scanMarkedFrontUnmarkedWriteIns.asFilePath();
  const hmpbBackUnmarkedWriteIns =
    fixtures.scanMarkedBackUnmarkedWriteIns.asFilePath();
  const hmpbFrontUnmarkedWriteInsOvervote =
    fixtures.scanMarkedFrontUnmarkedWriteInsOvervote.asFilePath();
  const hmpbBackUnmarkedWriteInsOvervote =
    fixtures.scanMarkedBackUnmarkedWriteInsOvervote.asFilePath();
  const validHmpbSheet: SheetOf<string> = [hmpbFront, hmpbBack];
  const validHmpbUnmarkedWriteInsSheet: SheetOf<string> = [
    hmpbFrontUnmarkedWriteIns,
    hmpbBackUnmarkedWriteIns,
  ];
  const validHmpbUnmarkedWriteInsOvervoteSheet: SheetOf<string> = [
    hmpbFrontUnmarkedWriteInsOvervote,
    hmpbBackUnmarkedWriteInsOvervote,
  ];

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

  test('interprets an unmarked write-in with enough of its write-in area filled as a vote', async () => {
    const interpretationResult = await interpretSheet(
      {
        electionDefinition: {
          ...electionDefinition,
          election: {
            ...electionDefinition.election,
            markThresholds: {
              ...(electionDefinition.election.markThresholds ?? {
                marginal: 1,
                definite: 1,
              }),
              writeInTextArea: 0.05,
            },
          },
        },
        precinctSelection: ALL_PRECINCTS_SELECTION,
        testMode: true,
      },
      validHmpbUnmarkedWriteInsSheet
    );

    const [front, back] = interpretationResult;
    assert(front.interpretation.type === 'InterpretedHmpbPage');
    assert(back.interpretation.type === 'InterpretedHmpbPage');

    const unmarkedWriteInMarks = [
      ...front.interpretation.markInfo.marks,
      ...back.interpretation.markInfo.marks,
    ].filter(
      (m) =>
        (m.contestId === 'Executive-Councilor-bb22557f' ||
          m.contestId === 'County-Treasurer-87d25a31' ||
          m.contestId === 'County-Commissioner-d6feed25') &&
        m.optionId === 'write-in-0'
    );
    expect(unmarkedWriteInMarks.map((m) => m.score)).toEqual([1, 1, 1]);
    expect(
      [
        ...front.interpretation.markInfo.marks,
        ...back.interpretation.markInfo.marks,
      ]
        .filter((m) => m.optionId.startsWith('write-in'))
        .map((m) => [m.contestId, m.optionId, m.score].join('|'))
    ).toMatchInlineSnapshot(`
      [
        "Governor-061a401b|write-in-0|0",
        "United-States-Senator-d3f1c75b|write-in-0|0",
        "Representative-in-Congress-24683b44|write-in-0|0",
        "Executive-Councilor-bb22557f|write-in-0|1",
        "State-Senator-391381f8|write-in-0|0",
        "State-Representatives-Hillsborough-District-34-b1012d38|write-in-0|0",
        "State-Representatives-Hillsborough-District-34-b1012d38|write-in-1|0",
        "State-Representatives-Hillsborough-District-34-b1012d38|write-in-2|0",
        "State-Representative-Hillsborough-District-37-f3bde894|write-in-0|0",
        "Sheriff-4243fe0b|write-in-0|0",
        "County-Attorney-133f910f|write-in-0|0",
        "County-Treasurer-87d25a31|write-in-0|1",
        "Register-of-Deeds-a1278df2|write-in-0|0",
        "Register-of-Probate-a4117da8|write-in-0|0",
        "County-Commissioner-d6feed25|write-in-0|1",
      ]
    `);
  });

  test('considers an unmarked write-in combined with a marked option as an overvote', async () => {
    const interpretationResult = await interpretSheet(
      {
        electionDefinition: {
          ...electionDefinition,
          election: {
            ...electionDefinition.election,
            markThresholds: {
              ...(electionDefinition.election.markThresholds ?? {
                marginal: 1,
                definite: 1,
              }),
              writeInTextArea: 0.05,
            },
          },
        },
        precinctSelection: ALL_PRECINCTS_SELECTION,
        testMode: true,
        adjudicationReasons: [AdjudicationReason.Overvote],
      },
      validHmpbUnmarkedWriteInsOvervoteSheet
    );

    const [front, back] = interpretationResult;
    assert(front.interpretation.type === 'InterpretedHmpbPage');
    assert(back.interpretation.type === 'InterpretedHmpbPage');

    expect(front.interpretation.adjudicationInfo.enabledReasonInfos)
      .toMatchInlineSnapshot(`
      [
        {
          "contestId": "Executive-Councilor-bb22557f",
          "expected": 1,
          "optionIds": [
            "Daniel-Webster-13f77b2d",
            "write-in-0",
          ],
          "optionIndexes": [
            1,
            2,
          ],
          "type": "Overvote",
        },
      ]
    `);
    expect(back.interpretation.adjudicationInfo.enabledReasonInfos)
      .toMatchInlineSnapshot(`
      [
        {
          "contestId": "County-Treasurer-87d25a31",
          "expected": 1,
          "optionIds": [
            "Jane-Jones-9caa141f",
            "write-in-0",
          ],
          "optionIndexes": [
            1,
            2,
          ],
          "type": "Overvote",
        },
      ]
    `);
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
