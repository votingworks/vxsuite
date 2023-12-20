import { assert, assertDefined, find, range } from '@votingworks/basics';
import {
  electionGeneral,
  electionFamousNames2021Fixtures,
  electionPrimaryPrecinctSplitsFixtures,
} from '@votingworks/fixtures';
import {
  AnyElement,
  gridPoint,
  layOutAllBallotStyles,
  measurements,
  Document,
  Rectangle,
  LayoutDensity,
  DEFAULT_LAYOUT_OPTIONS,
  BUBBLE_POSITIONS,
  LAYOUT_DENSITIES,
  TextBox,
  BubblePosition,
} from '@votingworks/hmpb-layout';
import {
  BallotPaperSize,
  BallotStyle,
  BallotType,
  Candidate,
  ContestId,
  Election,
  getBallotStyle,
  getContests,
  GridLayout,
  Id,
  Vote,
  VotesDict,
} from '@votingworks/types';
import { join } from 'path';

export const fixturesDir = join(__dirname, '../fixtures');
export const famousNamesDir = join(fixturesDir, 'famous-names');
export const generalElectionDir = join(fixturesDir, 'general-election');
export const primaryElectionDir = join(fixturesDir, 'primary-election');

function voteIsCandidate(vote: Vote[number]): vote is Candidate {
  return typeof vote !== 'string';
}

export function voteToOptionId(vote: Vote[number]): Id {
  return voteIsCandidate(vote) ? vote.id : vote;
}

interface MarkBallotParams {
  ballot: Document;
  gridLayout: GridLayout;
  votes: VotesDict;
  unmarkedWriteIns: Array<{
    contestId: ContestId;
    writeInIndex: number;
    text: string;
  }>;
  paperSize: BallotPaperSize;
  layoutDensity: LayoutDensity;
  bubblePosition: BubblePosition;
}

export function markBallot({
  ballot,
  gridLayout,
  votes,
  unmarkedWriteIns,
  paperSize,
  layoutDensity,
  bubblePosition,
}: MarkBallotParams): Document {
  const m = measurements(paperSize, layoutDensity);
  function marksForPage(page: number): AnyElement[] {
    const sheetNumber = Math.ceil(page / 2);
    const side = page % 2 === 1 ? 'front' : 'back';
    const pagePositions = gridLayout.gridPositions.filter(
      (position) =>
        position.sheetNumber === sheetNumber && position.side === side
    );
    const voteMarkContent = Object.entries(votes).flatMap(
      ([contestId, contestVotes]) => {
        if (!contestVotes) return [];
        const contestPositions = pagePositions.filter(
          (position) => position.contestId === contestId
        );
        if (contestPositions.length === 0) return []; // Contest not on this page
        return contestVotes?.flatMap((vote): AnyElement[] => {
          const optionPosition = find(contestPositions, (position) =>
            position.type === 'option'
              ? position.optionId === voteToOptionId(vote)
              : voteIsCandidate(vote) &&
                Boolean(vote.isWriteIn) &&
                position.writeInIndex === vote.writeInIndex
          );
          // Add offset to get bubble center (since interpreter indexes from
          // timing marks, while layout indexes from ballot edge)
          const position = gridPoint(
            {
              column: optionPosition.column + 1,
              row: optionPosition.row + 1,
            },
            m
          );
          const mark: Rectangle = {
            type: 'Rectangle',
            // Offset by half mark width/height
            x: position.x - 5,
            y: position.y - 4,
            width: 10,
            height: 8,
            fill: 'black',
          };

          const writeInText: TextBox | undefined =
            voteIsCandidate(vote) && vote.isWriteIn
              ? {
                  type: 'TextBox',
                  textLines: [vote.name],
                  x: position.x + (bubblePosition === 'right' ? -100 : 45),
                  y: position.y - 8,
                  width: 200,
                  height: 20,
                  ...m.FontStyles.BODY,
                }
              : undefined;

          return [mark, ...(writeInText ? [writeInText] : [])];
        });
      }
    );

    const unmarkedWriteInContent = unmarkedWriteIns.flatMap(
      ({ contestId, writeInIndex, text }): AnyElement[] => {
        const contestPositions = pagePositions.filter(
          (position) => position.contestId === contestId
        );
        if (contestPositions.length === 0) return []; // Contest not on this page
        const optionPosition = find(
          contestPositions,
          (position) =>
            position.type === 'write-in' &&
            position.writeInIndex === writeInIndex
        );
        // Add offset to get bubble center (since interpreter indexes from
        // timing marks, while layout indexes from ballot edge)
        const position = gridPoint(
          {
            column: optionPosition.column + 1,
            row: optionPosition.row + 1,
          },
          m
        );
        return [
          {
            type: 'TextBox',
            textLines: [text],
            x: position.x + (bubblePosition === 'right' ? -140 : 45),
            y: position.y - 8,
            width: 200,
            height: 20,
            ...m.FontStyles.BODY,
          },
        ];
      }
    );

    return [...voteMarkContent, ...unmarkedWriteInContent];
  }
  return {
    ...ballot,
    pages: ballot.pages.map((page, i) => ({
      ...page,
      children: page.children.concat(marksForPage(i + 1)),
    })),
  };
}

export const famousNamesFixtures = (() => {
  const { electionDefinition, ballots } = layOutAllBallotStyles({
    election: electionFamousNames2021Fixtures.election,
    ballotType: BallotType.Precinct,
    ballotMode: 'test',
    layoutOptions: DEFAULT_LAYOUT_OPTIONS,
  }).unsafeUnwrap();

  const { precinctId, document: ballot, gridLayout } = ballots[0];

  const votes: VotesDict = Object.fromEntries(
    electionDefinition.election.contests.map((contest, i) => {
      assert(contest.type === 'candidate');
      const candidates = range(0, contest.seats).map(
        (j) => contest.candidates[(i + j) % contest.candidates.length]
      );
      return [contest.id, candidates];
    })
  );

  const markedBallot = markBallot({
    ballot,
    gridLayout,
    votes,
    unmarkedWriteIns: [],
    paperSize: BallotPaperSize.Letter,
    layoutDensity: DEFAULT_LAYOUT_OPTIONS.layoutDensity,
    bubblePosition: 'left',
  });

  // Saved PDFs generated by generate_fixtures.ts
  const blankBallotPath = join(famousNamesDir, 'blank-ballot.pdf');
  const markedBallotPath = join(famousNamesDir, 'marked-ballot.pdf');

  return {
    electionDefinition,
    precinctId,
    gridLayout,
    blankBallot: ballot,
    markedBallot,
    votes,
    blankBallotPath,
    markedBallotPath,
  };
})();

export const generalElectionFixtures = (() => {
  const fixtures = [];

  for (const bubblePosition of BUBBLE_POSITIONS) {
    for (const paperSize of Object.values(BallotPaperSize)) {
      for (const layoutDensity of LAYOUT_DENSITIES) {
        const election: Election = {
          ...electionGeneral,
          ballotLayout: {
            ...electionGeneral.ballotLayout,
            paperSize,
          },
        };

        const { ballots, electionDefinition } = layOutAllBallotStyles({
          election,
          ballotType: BallotType.Absentee,
          ballotMode: 'official',
          layoutOptions: {
            bubblePosition,
            layoutDensity,
          },
        }).unsafeUnwrap();

        // Has ballot measures
        const ballotStyle = assertDefined(
          getBallotStyle({ election, ballotStyleId: '12' })
        );
        const precinctId = assertDefined(ballotStyle.precincts[0]);
        const { document: ballot, gridLayout } = find(
          ballots,
          (b) =>
            b.precinctId === precinctId &&
            b.gridLayout.ballotStyleId === ballotStyle.id
        );

        const contests = getContests({ election, ballotStyle });
        const votes: VotesDict = Object.fromEntries(
          contests.map((contest, i) => {
            if (contest.type === 'candidate') {
              const candidates = range(0, contest.seats - (i % 2)).map(
                (j) => contest.candidates[(i + j) % contest.candidates.length]
              );
              if (contest.allowWriteIns && i % 2 === 0) {
                const writeInIndex = i % contest.seats;
                candidates.push({
                  id: `write-in-${writeInIndex}`,
                  name: `Write-In #${writeInIndex + 1}`,
                  isWriteIn: true,
                  writeInIndex,
                });
              }
              return [contest.id, candidates];
            }
            return [
              contest.id,
              i % 2 === 0 ? [contest.yesOption.id] : [contest.noOption.id],
            ];
          })
        );

        const unmarkedWriteIns = contests.flatMap((contest, i) => {
          if (!(contest.type === 'candidate' && contest.allowWriteIns)) {
            return [];
          }
          // Skip contests where we already voted for a write-in above
          if (
            assertDefined(votes[contest.id]).some(
              (vote) => voteIsCandidate(vote) && vote.isWriteIn
            )
          ) {
            return [];
          }

          const writeInIndex = i % contest.seats;
          return [
            {
              contestId: contest.id,
              writeInIndex,
              text: `Unmarked Write-In #${writeInIndex + 1}`,
            },
          ];
        });

        const markedBallot = markBallot({
          ballot,
          gridLayout,
          votes,
          unmarkedWriteIns,
          paperSize,
          layoutDensity,
          bubblePosition,
        });

        const electionDir = join(
          generalElectionDir,
          `${bubblePosition}-${paperSize}-${layoutDensity}`
        );

        // Saved PDFs generated by generate_fixtures.ts
        const blankBallotPath = join(electionDir, 'blank-ballot.pdf');
        const markedBallotPath = join(electionDir, 'marked-ballot.pdf');

        fixtures.push({
          bubblePosition,
          paperSize,
          density: layoutDensity,
          electionDefinition,
          precinctId,
          ballotStyleId: ballotStyle.id,
          gridLayout,
          blankBallot: ballot,
          markedBallot,
          votes,
          unmarkedWriteIns,
          electionDir,
          blankBallotPath,
          markedBallotPath,
        });
      }
    }
  }

  return fixtures;
})();

export const primaryElectionFixtures = (() => {
  const { election } = electionPrimaryPrecinctSplitsFixtures;
  const { electionDefinition, ballots } = layOutAllBallotStyles({
    election,
    ballotType: BallotType.Precinct,
    ballotMode: 'test',
    layoutOptions: DEFAULT_LAYOUT_OPTIONS,
  }).unsafeUnwrap();

  function makePartyFixtures(partyLabel: string, ballotStyle: BallotStyle) {
    const precinctId = assertDefined(ballotStyle.precincts[0]);
    const otherPrecinctId = assertDefined(ballotStyle.precincts[1]);
    assert(precinctId !== otherPrecinctId);
    const { document: ballot, gridLayout } = find(
      ballots,
      (b) =>
        b.precinctId === precinctId &&
        b.gridLayout.ballotStyleId === ballotStyle.id
    );
    const { document: otherPrecinctBlankBallot } = find(
      ballots,
      (b) =>
        b.precinctId === otherPrecinctId &&
        b.gridLayout.ballotStyleId === ballotStyle.id
    );

    const contests = getContests({ election, ballotStyle });
    const votes: VotesDict = Object.fromEntries(
      contests.map((contest, i) => {
        if (contest.type === 'candidate') {
          const candidates = range(0, contest.seats).map(
            (j) => contest.candidates[(i + j) % contest.candidates.length]
          );
          return [contest.id, candidates];
        }
        return [
          contest.id,
          i % 2 === 0 ? [contest.yesOption.id] : [contest.noOption.id],
        ];
      })
    );

    const markedBallot = markBallot({
      ballot,
      gridLayout,
      votes,
      unmarkedWriteIns: [],
      paperSize: BallotPaperSize.Letter,
      layoutDensity: DEFAULT_LAYOUT_OPTIONS.layoutDensity,
      bubblePosition: 'left',
    });

    // Saved PDFs generated by generate_fixtures.ts
    const blankBallotPath = join(
      primaryElectionDir,
      `${partyLabel}-blank-ballot.pdf`
    );
    const markedBallotPath = join(
      primaryElectionDir,
      `${partyLabel}-marked-ballot.pdf`
    );
    const otherPrecinctBlankBallotPath = join(
      primaryElectionDir,
      `${partyLabel}-other-precinct-blank-ballot.pdf`
    );

    return {
      partyLabel,
      precinctId,
      gridLayout,
      blankBallot: ballot,
      markedBallot,
      votes,
      blankBallotPath,
      markedBallotPath,
      otherPrecinctBlankBallot,
      otherPrecinctBlankBallotPath,
    };
  }

  return {
    electionDefinition,
    mammalParty: makePartyFixtures(
      'mammal',
      assertDefined(getBallotStyle({ election, ballotStyleId: 'm-c1-w1' }))
    ),
    fishParty: makePartyFixtures(
      'fish',
      assertDefined(getBallotStyle({ election, ballotStyleId: 'f-c1-w1' }))
    ),
  };
})();
