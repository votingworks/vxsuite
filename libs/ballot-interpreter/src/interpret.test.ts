import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireAmherstFixtures,
  electionSampleDefinition,
  electionSample,
} from '@votingworks/fixtures';
import {
  AdjudicationReason,
  InvalidElectionHashPage,
  mapSheet,
  BallotPaperSize,
  BallotTargetMarkPosition,
  Candidate,
  CandidateVote,
  Election,
  ElectionDefinition,
  getBallotStyle,
  getContests,
  GridLayout,
  PrecinctId,
  SheetOf,
  Vote,
  VotesDict,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import {
  typedAs,
  assert,
  assertDefined,
  find,
  iter,
  Optional,
} from '@votingworks/basics';
import { Buffer } from 'buffer';
import { pdfToImages, writeImageData } from '@votingworks/image-utils';
import {
  Document,
  TextBox,
  gridPosition,
  range,
  AnyElement,
  measurements,
  layOutAllBallots,
} from '@votingworks/hmpb-layout';
import { tmpNameSync } from 'tmp';
import {
  renderDocumentToPdf,
  allBubbleBallotBlankBallot,
  allBubbleBallotCyclingTestDeck,
  allBubbleBallotElectionDefinition,
  allBubbleBallotFilledBallot,
} from '@votingworks/hmpb-render-backend';
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

async function pdfToBuffer(pdf: PDFKit.PDFDocument): Promise<Buffer> {
  const promise = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk) => chunks.push(chunk));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
  });
  pdf.end();
  return promise;
}

async function renderAndInterpretBallot({
  electionDefinition,
  precinctId,
  ballot,
  testMode = true,
}: {
  electionDefinition: ElectionDefinition;
  precinctId: PrecinctId;
  ballot: Document;
  testMode?: boolean;
}) {
  const pdfStream = renderDocumentToPdf(ballot);
  const pdfBuffer = await pdfToBuffer(pdfStream);
  const pageImages = await iter(
    pdfToImages(pdfBuffer, { scale: 200 / 72 })
  ).toArray();
  expect(pageImages.length).toEqual(2);
  const pageImagePaths: SheetOf<string> = [
    tmpNameSync({ postfix: '.jpg' }),
    tmpNameSync({ postfix: '.jpg' }),
  ];
  await writeImageData(pageImagePaths[0], pageImages[0]!.page);
  await writeImageData(pageImagePaths[1], pageImages[1]!.page);

  return interpretSheet(
    {
      electionDefinition,
      precinctSelection: singlePrecinctSelectionFor(precinctId),
      testMode,
    },
    pageImagePaths
  );
}

function voteToOptionId(vote: Vote[number]) {
  return vote === 'yes' || vote === 'no' ? vote : vote.id;
}

function sortVotes(vote: Vote) {
  return [...vote].sort((a, b) =>
    voteToOptionId(a).localeCompare(voteToOptionId(b))
  );
}

function sortVotesDict(votes: VotesDict) {
  return Object.fromEntries(
    Object.entries(votes).map(([contestId, candidates]) => [
      contestId,
      sortVotes(candidates ?? []),
    ])
  );
}

describe('HMPB - All bubble ballot', () => {
  const electionDefinition = allBubbleBallotElectionDefinition;
  const { election } = electionDefinition;
  const precinctId = election.precincts[0]!.id;

  const [frontContest, backContest] = election.contests;
  assert(frontContest?.type === 'candidate');
  assert(backContest?.type === 'candidate');

  test('Blank ballot interpretation', async () => {
    const [frontResult, backResult] = await renderAndInterpretBallot({
      electionDefinition,
      precinctId,
      ballot: allBubbleBallotBlankBallot,
    });

    assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
    expect(frontResult.interpretation.votes).toEqual({});

    assert(backResult.interpretation.type === 'InterpretedHmpbPage');
    expect(backResult.interpretation.votes).toEqual({});
  });

  test('Filled ballot interpretation', async () => {
    const [frontResult, backResult] = await renderAndInterpretBallot({
      electionDefinition,
      precinctId,
      ballot: allBubbleBallotFilledBallot,
    });

    assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
    expect(frontResult.interpretation.votes).toEqual({
      [frontContest.id]: frontContest.candidates,
    });

    assert(backResult.interpretation.type === 'InterpretedHmpbPage');
    expect(backResult.interpretation.votes).toEqual({
      [backContest.id]: backContest.candidates,
    });
  });

  test('Cycling test deck interpretation', async () => {
    const votes = {
      [frontContest.id]: [] as Candidate[],
      [backContest.id]: [] as Candidate[],
    } as const;

    for (const card of range(0, 6)) {
      const [frontResult, backResult] = await renderAndInterpretBallot({
        electionDefinition,
        precinctId,
        ballot: {
          ...allBubbleBallotCyclingTestDeck,
          pages: allBubbleBallotCyclingTestDeck.pages.slice(
            card * 2,
            (card + 1) * 2
          ),
        },
      });
      assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
      assert(backResult.interpretation.type === 'InterpretedHmpbPage');

      for (const [contestId, candidates] of Object.entries({
        ...frontResult.interpretation.votes,
        ...backResult.interpretation.votes,
      })) {
        votes[contestId]!.push(
          ...((candidates as Optional<CandidateVote>) ?? [])
        );
      }
    }

    expect(sortVotesDict(votes)).toEqual(
      sortVotesDict({
        [frontContest.id]: frontContest.candidates,
        [backContest.id]: backContest.candidates,
      })
    );
  }, 30_000);
});

function markBallot(
  ballot: Document,
  gridLayout: GridLayout,
  votesToMark: VotesDict,
  paperSize: BallotPaperSize,
  density: number
) {
  assert(ballot.pages.length === 2, 'Only two page ballots are supported');
  const m = measurements(paperSize, density);
  function marksForPage(page: number): AnyElement[] {
    const side = page === 1 ? 'front' : 'back';
    const pagePositions = gridLayout.gridPositions.filter(
      (position) => position.side === side
    );
    return Object.entries(votesToMark).flatMap(([contestId, votes]) => {
      if (!votes) return [];
      const contestPositions = pagePositions.filter(
        (position) => position.contestId === contestId
      );
      if (contestPositions.length === 0) return []; // Contest not on this page
      return votes?.map((vote): TextBox => {
        const optionPosition = find(
          contestPositions,
          (position) =>
            position.type === 'option' &&
            position.optionId === voteToOptionId(vote)
        );
        // Add offset to get bubble center (since interpreter indexes from
        // timing marks, while layout indexes from ballot edge)
        const position = gridPosition(
          {
            column: optionPosition.column + 1,
            row: optionPosition.row + 1,
          },
          m
        );
        return {
          type: 'TextBox',
          // Offset by half bubble width/height
          x: position.x - 3,
          y: position.y - 5,
          width: 10,
          height: 10,
          textLines: ['X'],
          lineHeight: 10,
          fontSize: 10,
          fontWeight: 700,
        };
      });
    });
  }
  return {
    ...ballot,
    pages: ballot.pages.map((page, i) => ({
      ...page,
      children: page.children.concat(marksForPage(i + 1)),
    })),
  };
}

describe('HMPB - Famous Names', () => {
  const { ballots, electionDefinition } = layOutAllBallots({
    election: electionFamousNames2021Fixtures.election,
    isTestMode: true,
  }).unsafeUnwrap();
  const { election } = electionDefinition;

  test('Blank ballot interpretation', async () => {
    const { document: ballot, gridLayout } = ballots[0]!;
    const { precinctId } = gridLayout;
    const [frontResult, backResult] = await renderAndInterpretBallot({
      electionDefinition,
      precinctId,
      ballot,
    });

    assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
    expect(frontResult.interpretation.votes).toEqual({});
    assert(backResult.interpretation.type === 'InterpretedHmpbPage');
    expect(backResult.interpretation.votes).toEqual({});
  });

  test('Marked ballot interpretation', async () => {
    const { document: ballot, gridLayout } = ballots[0]!;
    const { precinctId } = gridLayout;

    const votes: VotesDict = Object.fromEntries(
      electionDefinition.election.contests.map((contest, i) => {
        assert(contest.type === 'candidate');
        const candidates = range(0, contest.seats).map(
          (j) => contest.candidates[(i + j) % contest.candidates.length]!
        );
        return [contest.id, candidates];
      })
    );

    const markedBallot = markBallot(
      ballot,
      gridLayout,
      votes,
      BallotPaperSize.Letter,
      0
    );

    const [frontResult, backResult] = await renderAndInterpretBallot({
      electionDefinition,
      precinctId,
      ballot: markedBallot,
    });

    assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
    assert(backResult.interpretation.type === 'InterpretedHmpbPage');
    expect(
      sortVotesDict({
        ...frontResult.interpretation.votes,
        ...backResult.interpretation.votes,
      })
    ).toEqual(sortVotesDict(votes));
  });

  test('Wrong election', async () => {
    const { document: ballot, gridLayout } = ballots[0]!;
    const { precinctId } = gridLayout;

    const [frontResult, backResult] = await renderAndInterpretBallot({
      electionDefinition: {
        ...electionDefinition,
        electionHash: 'wrong election hash',
      },
      precinctId,
      ballot,
    });

    expect(frontResult.interpretation.type).toEqual('InvalidElectionHashPage');
    expect(backResult.interpretation.type).toEqual('InvalidElectionHashPage');
  });

  test('Wrong precinct', async () => {
    const { document: ballot, gridLayout } = ballots[0]!;
    const { precinctId } = gridLayout;
    assert(precinctId !== election.precincts[1]!.id);

    const [frontResult, backResult] = await renderAndInterpretBallot({
      electionDefinition,
      precinctId: election.precincts[1]!.id,
      ballot,
    });

    expect(frontResult.interpretation.type).toEqual('InvalidPrecinctPage');
    expect(backResult.interpretation.type).toEqual('InvalidPrecinctPage');
  });

  test('Wrong test mode', async () => {
    const { document: ballot, gridLayout } = ballots[0]!;
    const { precinctId } = gridLayout;

    const [frontResult, backResult] = await renderAndInterpretBallot({
      electionDefinition,
      precinctId,
      ballot,
      testMode: false,
    });

    expect(frontResult.interpretation.type).toEqual('InvalidTestModePage');
    expect(backResult.interpretation.type).toEqual('InvalidTestModePage');
  });
});

for (const targetMarkPosition of Object.values(BallotTargetMarkPosition)) {
  for (const paperSize of [BallotPaperSize.Letter, BallotPaperSize.Legal]) {
    for (const density of [0, 1, 2]) {
      describe(`HMPB - electionSample - bubbles on ${targetMarkPosition} - ${paperSize} paper - density ${density}`, () => {
        const election: Election = {
          ...electionSample,
          ballotLayout: {
            ...electionSample.ballotLayout,
            targetMarkPosition,
            paperSize,
          },
          // Fill in missing mark thresholds
          markThresholds:
            electionFamousNames2021Fixtures.election.markThresholds,
        };
        const { ballots, electionDefinition } = layOutAllBallots({
          election,
          isTestMode: true,
        }).unsafeUnwrap();
        // Has ballot measures
        const ballotStyle = assertDefined(
          getBallotStyle({ election, ballotStyleId: '5' })
        );
        const precinctId = ballotStyle.precincts[0]!;
        const { document: ballot, gridLayout } = find(
          ballots,
          (b) =>
            b.gridLayout.precinctId === precinctId &&
            b.gridLayout.ballotStyleId === ballotStyle.id
        );
        // We only support single-sheet ballots for now
        ballot.pages = ballot.pages.slice(0, 2);

        test(`Blank ballot interpretation`, async () => {
          const [frontResult, backResult] = await renderAndInterpretBallot({
            electionDefinition,
            precinctId,
            ballot,
          });

          assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
          expect(frontResult.interpretation.votes).toEqual({});
          assert(backResult.interpretation.type === 'InterpretedHmpbPage');
          expect(backResult.interpretation.votes).toEqual({});
        });

        test(`Marked ballot interpretation`, async () => {
          // Since we currently only support interpreting single-sheet ballots, we can
          // only evaluate interpreting contests that we know will fit on two pages.
          const contestsOnFirstSheet = assertDefined(
            getContests({ election, ballotStyle })
          ).filter((contest) =>
            paperSize === BallotPaperSize.Letter
              ? [
                  'president',
                  'representative-district-6',
                  'lieutenant-governor',
                  'state-senator-district-31',
                  'state-assembly-district-54',
                  'county-registrar-of-wills',
                  'judicial-robert-demergue',
                  'question-a',
                  'question-b',
                ].includes(contest.id)
              : // All contests fit on one legal-size sheet
                true
          );
          const votes: VotesDict = Object.fromEntries(
            contestsOnFirstSheet.map((contest, i) => {
              if (contest.type === 'candidate') {
                const candidates = range(0, contest.seats).map(
                  (j) => contest.candidates[(i + j) % contest.candidates.length]
                );
                return [contest.id, candidates];
              }
              return [contest.id, i % 2 === 0 ? ['yes'] : ['no']];
            })
          );

          const markedBallot = markBallot(
            ballot,
            gridLayout,
            votes,
            paperSize,
            density
          );

          const [frontResult, backResult] = await renderAndInterpretBallot({
            electionDefinition,
            precinctId,
            ballot: markedBallot,
          });

          assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
          assert(backResult.interpretation.type === 'InterpretedHmpbPage');
          expect(
            sortVotesDict({
              ...frontResult.interpretation.votes,
              ...backResult.interpretation.votes,
            })
          ).toEqual(sortVotesDict(votes));
        });
      });
    }
  }
}
