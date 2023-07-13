import {
  assert,
  assertDefined,
  find,
  iter,
  Optional,
} from '@votingworks/basics';
import { Buffer } from 'buffer';
import { pdfToImages, writeImageData } from '@votingworks/image-utils';
import { interpretSheet } from '@votingworks/ballot-interpreter';
import {
  Document,
  TextBox,
  layOutBallot,
  gridPosition,
  range,
  AnyElement,
  measurements,
} from '@votingworks/design-shared';
import {
  asElectionDefinition,
  electionFamousNames2021Fixtures,
  electionSample,
} from '@votingworks/fixtures';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import { tmpNameSync } from 'tmp';
import {
  BallotPaperSize,
  BallotTargetMarkPosition,
  Candidate,
  CandidateVote,
  Election,
  getBallotStyle,
  getContests,
  getPrecinctById,
  GridLayout,
  Precinct,
  SheetOf,
  Vote,
  VotesDict,
} from '@votingworks/types';
import { renderDocumentToPdf } from './render_ballot';
import {
  allBubbleBallotBlankBallot,
  allBubbleBallotCyclingTestDeck,
  allBubbleBallotElection,
  allBubbleBallotFilledBallot,
} from './all_bubble_ballots';

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

async function interpretBallot({
  election,
  precinct,
  ballot,
}: {
  election: Election;
  precinct: Precinct;
  ballot: Document;
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
  await writeImageData(pageImagePaths[0], pageImages[0].page);
  await writeImageData(pageImagePaths[1], pageImages[1].page);

  return interpretSheet(
    {
      electionDefinition: asElectionDefinition(election),
      precinctSelection: singlePrecinctSelectionFor(precinct.id),
      testMode: true,
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

describe('All bubble ballot', () => {
  const election = allBubbleBallotElection;
  const precinct = assertDefined(election.precincts[0]);

  const [frontContest, backContest] = election.contests;
  assert(frontContest.type === 'candidate');
  assert(backContest.type === 'candidate');

  test('Blank ballot interpretation', async () => {
    const [frontResult, backResult] = await interpretBallot({
      election,
      precinct,
      ballot: allBubbleBallotBlankBallot,
    });

    assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
    expect(frontResult.interpretation.votes).toEqual({});

    assert(backResult.interpretation.type === 'InterpretedHmpbPage');
    expect(backResult.interpretation.votes).toEqual({});
  });

  test('Filled ballot interpretation', async () => {
    const [frontResult, backResult] = await interpretBallot({
      election,
      precinct,
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
      const [frontResult, backResult] = await interpretBallot({
        election,
        precinct,
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
        votes[contestId].push(
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
  }, 20_000);
});

function markBallot(
  ballot: Document,
  gridLayout: GridLayout,
  votesToMark: VotesDict,
  paperSize: BallotPaperSize
) {
  assert(ballot.pages.length === 2, 'Only two page ballots are supported');
  const m = measurements(paperSize);
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

describe('Laid out ballots - Famous Names', () => {
  const { election } = electionFamousNames2021Fixtures;
  const ballotStyle = election.ballotStyles[0];

  test('Blank ballot interpretation', async () => {
    const precinct = election.precincts[1];

    const ballotResult = layOutBallot(election, precinct, ballotStyle);
    assert(ballotResult.isOk());
    const { document: ballot, gridLayout } = ballotResult.ok();

    const [frontResult, backResult] = await interpretBallot({
      election: { ...election, gridLayouts: [gridLayout] },
      precinct,
      ballot,
    });

    assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
    expect(frontResult.interpretation.votes).toEqual({});
    assert(backResult.interpretation.type === 'InterpretedHmpbPage');
    expect(backResult.interpretation.votes).toEqual({});
  });

  test('Marked ballot interpretation', async () => {
    const precinct = election.precincts[2];

    const votes: VotesDict = Object.fromEntries(
      election.contests.map((contest, i) => {
        assert(contest.type === 'candidate');
        const candidates = range(0, contest.seats).map(
          (j) => contest.candidates[(i + j) % contest.candidates.length]
        );
        return [contest.id, candidates];
      })
    );

    const ballotResult = layOutBallot(election, precinct, ballotStyle);
    assert(ballotResult.isOk());
    const { document: ballot, gridLayout } = ballotResult.ok();
    const markedBallot = markBallot(
      ballot,
      gridLayout,
      votes,
      BallotPaperSize.Letter
    );

    const [frontResult, backResult] = await interpretBallot({
      election: { ...election, gridLayouts: [gridLayout] },
      precinct,
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

for (const targetMarkPosition of Object.values(BallotTargetMarkPosition)) {
  for (const paperSize of [BallotPaperSize.Letter, BallotPaperSize.Legal]) {
    describe(`Laid out ballots - electionSample - bubbles on ${targetMarkPosition} - ${paperSize} paper`, () => {
      const election: Election = {
        ...electionSample,
        ballotLayout: {
          ...assertDefined(electionSample.ballotLayout),
          targetMarkPosition,
          paperSize,
        },
        // Fill in missing mark thresholds
        markThresholds: electionFamousNames2021Fixtures.election.markThresholds,
      };
      // Has ballot measures
      const ballotStyle = assertDefined(
        getBallotStyle({ election, ballotStyleId: '5' })
      );
      const precinct = assertDefined(
        getPrecinctById({ election, precinctId: ballotStyle.precincts[0] })
      );

      test(`Blank ballot interpretation`, async () => {
        const ballotResult = layOutBallot(election, precinct, ballotStyle);
        assert(ballotResult.isOk());
        const { document: ballot, gridLayout } = ballotResult.ok();
        // We only support single-sheet ballots for now
        ballot.pages = ballot.pages.slice(0, 2);

        const [frontResult, backResult] = await interpretBallot({
          election: { ...election, gridLayouts: [gridLayout] },
          precinct,
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

        const ballotResult = layOutBallot(election, precinct, ballotStyle);
        assert(ballotResult.isOk());
        const { document: ballot, gridLayout } = ballotResult.ok();
        // We only support single-sheet ballots for now
        ballot.pages = ballot.pages.slice(0, 2);
        const markedBallot = markBallot(ballot, gridLayout, votes, paperSize);

        const [frontResult, backResult] = await interpretBallot({
          election: { ...election, gridLayouts: [gridLayout] },
          precinct,
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
