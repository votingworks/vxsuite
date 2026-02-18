import {
  Candidate,
  ContestId,
  Contests,
  Id,
  Vote,
  VotesDict,
  WriteInCandidate,
} from '@votingworks/types';
import { assertDefined, iter, throwIllegalValue } from '@votingworks/basics';
import React from 'react';
import { RenderDocument } from './renderer';
import {
  BUBBLE_CLASS,
  BubbleShape,
  MARK_OVERLAY_CLASS,
  OptionInfo,
  PAGE_CLASS,
} from './ballot_components';
import {
  convertBallotMeasureWithAdditionalOptionsToCandidateContest,
  gridHeightToPixels,
  gridWidthToPixels,
  measureTimingMarkGrid,
} from './render_ballot';

function voteIsCandidate(vote: Vote[number]): vote is Candidate {
  return typeof vote !== 'string';
}

export function voteToOptionId(vote: Vote[number]): Id {
  return voteIsCandidate(vote) ? vote.id : vote;
}

export type UnmarkedWriteInVote = { contestId: ContestId } & Pick<
  WriteInCandidate,
  'writeInIndex' | 'name'
>;

export async function markBallotDocument(
  ballotDocument: RenderDocument,
  votes: VotesDict,
  unmarkedWriteIns?: UnmarkedWriteInVote[]
): Promise<RenderDocument> {
  const pages = await ballotDocument.inspectElements(`.${PAGE_CLASS}`);
  for (const [i, page] of pages.entries()) {
    const pageNumber = i + 1;
    const bubbles = await ballotDocument.inspectElements(
      `.${PAGE_CLASS}[data-page-number="${pageNumber}"] .${BUBBLE_CLASS}`
    );
    const grid = await measureTimingMarkGrid(ballotDocument, pageNumber);

    const marks = (
      <>
        {bubbles.flatMap((bubble) => {
          const optionInfo = JSON.parse(bubble.data.optionInfo) as OptionInfo;
          const contestVotes = votes[optionInfo.contestId];
          switch (optionInfo.type) {
            case 'option': {
              const optionHasVote = contestVotes?.some(
                (vote) => voteToOptionId(vote) === optionInfo.optionId
              );
              return optionHasVote ? (
                <BubbleShape
                  key={optionInfo.optionId}
                  isFilled
                  style={{
                    position: 'absolute',
                    top: bubble.y - page.y,
                    left: bubble.x - page.x,
                  }}
                />
              ) : undefined;
            }

            case 'write-in': {
              const markedWriteInVote = contestVotes?.find(
                (vote): vote is WriteInCandidate => {
                  const voteWriteInIndex = voteIsCandidate(vote)
                    ? vote.writeInIndex
                    : undefined;
                  return voteWriteInIndex === optionInfo.writeInIndex;
                }
              );
              const unmarkedWriteInVote = unmarkedWriteIns?.find(
                (uwi) =>
                  uwi.contestId === optionInfo.contestId &&
                  uwi.writeInIndex === optionInfo.writeInIndex
              );
              const optionVote = markedWriteInVote ?? unmarkedWriteInVote;
              if (!optionVote) return undefined;

              const writeInAreaX =
                bubble.x +
                bubble.width / 2 -
                gridWidthToPixels(grid, optionInfo.writeInArea.left);
              const writeInAreaY =
                bubble.y +
                bubble.height / 2 -
                gridHeightToPixels(grid, optionInfo.writeInArea.top);
              const writeInAreaWidth = gridWidthToPixels(
                grid,
                optionInfo.writeInArea.right + optionInfo.writeInArea.left
              );
              const writeInAreaHeight = gridHeightToPixels(
                grid,
                optionInfo.writeInArea.bottom + optionInfo.writeInArea.top
              );

              return (
                <React.Fragment
                  key={optionInfo.contestId + optionInfo.writeInIndex}
                >
                  {optionVote === markedWriteInVote && (
                    <BubbleShape
                      isFilled
                      style={{
                        position: 'absolute',
                        top: bubble.y - page.y,
                        left: bubble.x - page.x,
                      }}
                    />
                  )}
                  <div
                    style={{
                      position: 'absolute',
                      top: writeInAreaY - page.y,
                      left: writeInAreaX - page.x,
                      width: writeInAreaWidth,
                      height: writeInAreaHeight,
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'end',
                    }}
                  >
                    {optionVote.name}
                  </div>
                </React.Fragment>
              );
            }

            default:
              return throwIllegalValue(optionInfo);
          }
        })}
      </>
    );

    await ballotDocument.setContent(
      `.${PAGE_CLASS}[data-page-number="${pageNumber}"] .${MARK_OVERLAY_CLASS}`,
      marks
    );
  }
  return ballotDocument;
}

export function createTestVotes(contests: Contests): {
  votes: VotesDict;
  unmarkedWriteIns: UnmarkedWriteInVote[];
} {
  const votes: VotesDict = Object.fromEntries(
    contests
      .filter((c) => c.type !== 'straight-party')
      .map((contest, i) => {
        if (contest.type === 'candidate') {
          const candidates = iter(contest.candidates)
            .cycle()
            .skip(i)
            .take(contest.seats - (i % 2))
            .toArray()
            // List candidates in the order they appear on the ballot
            .sort(
              (a, b) =>
                contest.candidates.indexOf(a) - contest.candidates.indexOf(b)
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
        if (
          contest.additionalOptions &&
          contest.additionalOptions.length > 0
        ) {
          return [
            contest.id,
            [
              convertBallotMeasureWithAdditionalOptionsToCandidateContest(
                contest
              ).candidates[0],
            ],
          ];
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
        name: `Unmarked Write-In #${writeInIndex + 1}`,
      },
    ];
  });

  return { votes, unmarkedWriteIns };
}
