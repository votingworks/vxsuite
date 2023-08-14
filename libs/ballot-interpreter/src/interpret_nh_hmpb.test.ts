import { assert, unique } from '@votingworks/basics';
import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import {
  SheetOf,
  mapSheet,
  AdjudicationReason,
  safeParseElectionDefinition,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { interpretSheet } from './interpret';

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

describe('HMPB - m17 backup', () => {
  const fixtureDir = join(__dirname, '../test/fixtures/m17-backup');
  const electionDefinition = safeParseElectionDefinition(
    readFileSync(join(fixtureDir, 'election.json'), 'utf8')
  ).unsafeUnwrap();
  const ballotIds = unique(
    readdirSync(fixtureDir)
      .filter((f) => f.endsWith('.jpg'))
      .map((f) => f.replace(/(-front|-back)\.jpg$/, ''))
  );

  test('Interprets all ballots correctly', async () => {
    for (const ballotId of ballotIds) {
      const sheet: SheetOf<string> = [
        join(fixtureDir, `${ballotId}-front.jpg`),
        join(fixtureDir, `${ballotId}-back.jpg`),
      ];

      const interpretationWithImages = await interpretSheet(
        {
          electionDefinition,
          precinctSelection: ALL_PRECINCTS_SELECTION,
          testMode: false,
        },
        sheet
      );

      const interpretation = mapSheet(interpretationWithImages, (page) => {
        // Only snapshot stable fields - marks and layout coordinates may change slightly on CI
        if (page.interpretation.type === 'InterpretedHmpbPage') {
          const { type, metadata, votes } = page.interpretation;
          return { type, metadata, votes };
        }
        return page.interpretation;
      });
      expect({ [ballotId]: interpretation }).toMatchSnapshot();
    }
  });
});
