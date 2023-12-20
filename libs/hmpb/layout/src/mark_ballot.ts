import { assert, find, throwIllegalValue } from '@votingworks/basics';
import {
  Candidate,
  Id,
  Vote,
  VotesDict,
  WriteInCandidate,
} from '@votingworks/types';
import { AnyElement, Bubble, Document } from './document_types';
import { FontStyle, FontWeights, textWidth } from './layout';

function mapDocument(
  document: Document,
  fn: (element: AnyElement) => AnyElement
): Document {
  function mapElement(element: AnyElement): AnyElement {
    switch (element.type) {
      case 'Rectangle':
        return fn({
          ...element,
          children: element.children?.map((child) => mapElement(child)),
        });
      case 'Bubble':
      case 'TextBox':
      case 'Image':
        return fn(element);

      default:
        return throwIllegalValue(element);
    }
  }

  return {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      children: page.children.map(mapElement),
    })),
  };
}

function voteIsCandidate(vote: Vote[number]): vote is Candidate {
  return typeof vote !== 'string';
}

export function voteToOptionId(vote: Vote[number]): Id {
  return voteIsCandidate(vote) ? vote.id : vote;
}

export function markBallot({
  ballot,
  votes,
}: {
  ballot: Document;
  votes: VotesDict;
}): Document {
  return mapDocument(ballot, (element) => {
    // In order to fill bubbles and add text for write-ins, we need the option
    // element (which contains a bubble and a write-in line)
    if (element.type !== 'Rectangle') return element;
    const bubbleElement = element.children?.find(
      (child): child is Bubble => child.type === 'Bubble'
    );
    if (!bubbleElement) return element;
    assert(element.children);

    const { gridPosition } = bubbleElement;
    const contestVotes = votes[gridPosition.contestId];
    if (!contestVotes) return element;

    switch (gridPosition.type) {
      case 'option': {
        const optionHasVote = contestVotes.some(
          (vote) => gridPosition.optionId === voteToOptionId(vote)
        );
        if (!optionHasVote) return element;
        return {
          ...element,
          children: element.children?.map((child) =>
            child === bubbleElement ? { ...child, fill: 'black' } : child
          ),
        };
      }

      case 'write-in': {
        const optionVote = contestVotes.find(
          (vote): vote is WriteInCandidate => {
            const voteWriteInIndex = voteIsCandidate(vote)
              ? vote.writeInIndex
              : undefined;
            return gridPosition.writeInIndex === voteWriteInIndex;
          }
        );
        if (!optionVote) return element;
        const writeInLine = find(
          element.children,
          (child) => child.type === 'Rectangle' && child.fill === 'black'
        );
        const fontStyle: FontStyle = {
          fontSize: 10,
          fontWeight: FontWeights.NORMAL,
          lineHeight: 10,
        };
        const writeInTextWidth = textWidth(optionVote.name, fontStyle);
        return {
          ...element,
          children: [
            ...element.children.map((child) =>
              child === bubbleElement ? { ...child, fill: 'black' } : child
            ),
            {
              type: 'TextBox',
              textLines: [optionVote.name],
              x: writeInLine.x + writeInLine.width / 2 - writeInTextWidth / 2,
              y:
                writeInLine.y - fontStyle.lineHeight - fontStyle.lineHeight / 4,
              width: writeInTextWidth,
              height: fontStyle.lineHeight + fontStyle.lineHeight / 4,
              ...fontStyle,
            },
          ],
        };
      }

      default:
        return throwIllegalValue(gridPosition);
    }
  });
}
