import React from 'react';
import { ballotPaperDimensions } from '@votingworks/types';
import { assertDefined, ok, range } from '@votingworks/basics';
import {
  BallotPageTemplate,
  BaseBallotProps,
  ContentComponentResult,
} from '../render_ballot';
import {
  Bubble,
  Page,
  pageMarginsInches,
  TimingMarkGrid,
} from '../ballot_components';
import { PixelDimensions } from '../types';
import { RenderScratchpad } from '../renderer';
import { footerRowHeight, gridColumns, gridRows, numPages } from './config';
import { candidateId, contestId } from './election';
import { Footer } from './footer';

function BallotPageFrame({
  election,
  pageNumber,
  totalPages,
  children,
}: BaseBallotProps & {
  pageNumber: number;
  totalPages?: number;
  children: JSX.Element;
}): JSX.Element {
  const dimensions = ballotPaperDimensions(election.ballotLayout.paperSize);
  return (
    <Page
      key={pageNumber}
      pageNumber={pageNumber}
      dimensions={dimensions}
      margins={pageMarginsInches}
    >
      <TimingMarkGrid pageDimensions={dimensions}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: '0.05in',
          }}
        >
          <div
            style={{
              flex: 1,
              // Prevent this flex item from overflowing its container
              // https://stackoverflow.com/a/66689926
              minHeight: 0,
            }}
          >
            {children}
          </div>
          <Footer pageNumber={pageNumber} totalPages={totalPages} />
        </div>
      </TimingMarkGrid>
    </Page>
  );
}

// eslint-disable-next-line @typescript-eslint/require-await
async function BallotPageContent(
  props: (BaseBallotProps & { dimensions: PixelDimensions }) | undefined,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _scratchpad: RenderScratchpad
): Promise<ContentComponentResult<BaseBallotProps>> {
  const { election, ...restProps } = assertDefined(props);
  const pageNumber = numPages - election.contests.length + 1;
  const bubbles = (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        paddingTop: '0.12in',
        paddingBottom: '0.055in',
      }}
    >
      {range(1, gridRows - footerRowHeight - 1).flatMap((row) => (
        <div
          key={`row-${row}`}
          style={{ display: 'flex', justifyContent: 'space-between' }}
        >
          {range(1, gridColumns - 1).map((column) => (
            <Bubble
              key={`bubble-${row}-${column}`}
              optionInfo={{
                type: 'option',
                contestId: contestId(pageNumber),
                optionId: candidateId(pageNumber, row, column),
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
  const contestsLeft = election.contests.slice(1);
  return ok({
    currentPageElement: bubbles,
    nextPageProps:
      contestsLeft.length === 0
        ? undefined
        : {
            ...restProps,
            election: {
              ...election,
              contests: contestsLeft,
            },
          },
  });
}

export const allBubbleBallotTemplate: BallotPageTemplate<BaseBallotProps> = {
  frameComponent: BallotPageFrame,
  contentComponent: BallotPageContent,
};
