import {
  Candidate,
  ContestId,
  Id,
  Vote,
  VotesDict,
  WriteInCandidate,
} from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/basics';
import React from 'react';
import { RenderDocument, Renderer } from './renderer';
import {
  BUBBLE_CLASS,
  BubbleShape,
  MARK_OVERLAY_CLASS,
  OptionInfo,
  PAGE_CLASS,
} from './ballot_components';
import {
  gridHeightToPixels,
  gridWidthToPixels,
  measureTimingMarkGrid,
} from './render_ballot';

export function voteIsCandidate(vote: Vote[number]): vote is Candidate {
  return typeof vote !== 'string';
}

export function voteToOptionId(vote: Vote[number]): Id {
  return voteIsCandidate(vote) ? vote.id : vote;
}

export async function markBallotDocument(
  renderer: Renderer,
  ballotDocument: RenderDocument,
  votes: VotesDict,
  unmarkedWriteIns?: Array<
    { contestId: ContestId } & Pick<WriteInCandidate, 'writeInIndex' | 'name'>
  >
): Promise<RenderDocument> {
  const markedBallotDocument = await renderer.cloneDocument(ballotDocument);
  const pages = await markedBallotDocument.inspectElements(`.${PAGE_CLASS}`);
  for (const [i, page] of pages.entries()) {
    const pageNumber = i + 1;
    const bubbles = await markedBallotDocument.inspectElements(
      `.${PAGE_CLASS}[data-page-number="${pageNumber}"] .${BUBBLE_CLASS}`
    );
    const grid = await measureTimingMarkGrid(markedBallotDocument, pageNumber);

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
              const writeInAreaWidth =
                gridWidthToPixels(grid, optionInfo.writeInArea.right) +
                gridWidthToPixels(grid, optionInfo.writeInArea.left);
              const writeInAreaHeight =
                gridHeightToPixels(grid, optionInfo.writeInArea.bottom) +
                gridHeightToPixels(grid, optionInfo.writeInArea.top);

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
                      alignItems: 'center',
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

    await markedBallotDocument.setContent(
      `.${PAGE_CLASS}[data-page-number="${pageNumber}"] .${MARK_OVERLAY_CLASS}`,
      marks
    );
  }
  return markedBallotDocument;
}
