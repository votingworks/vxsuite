import React from 'react';
import {
  ballotPaperDimensions,
  BaseBallotProps,
  Contest,
  HmpbBallotPaperSize,
} from '@votingworks/types';
import { assert, ok, range, Result } from '@votingworks/basics';
import {
  BallotPageTemplate,
  ContentComponentResult,
  BallotLayoutError,
} from '../render_ballot.js';
import {
  Bubble,
  Page,
  pageMarginsInches,
  TimingMarkGrid,
} from '../ballot_components.js';
import { PixelDimensions } from '../types.js';
import { RenderScratchpad } from '../renderer.js';
import { allBubbleBallotConfig } from './config.js';
import { candidateId, contestId } from './election.js';
import { Footer } from './footer.js';
import { BaseStyles } from '../base_styles.js';

export function allBubbleBallotTemplate(
  paperSize: HmpbBallotPaperSize
): BallotPageTemplate<BaseBallotProps> {
  const { footerRowHeight, gridColumns, gridRows, numPages } =
    allBubbleBallotConfig(paperSize);

  function BallotPageFrame({
    election,
    pageNumber,
    totalPages,
    children,
  }: BaseBallotProps & {
    pageNumber: number;
    totalPages?: number;
    children: JSX.Element;
  }): Result<JSX.Element, BallotLayoutError> {
    const dimensions = ballotPaperDimensions(election.ballotLayout.paperSize);
    return ok(
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
    _props: BaseBallotProps & { dimensions: PixelDimensions },
    contests: readonly Contest[],
    _scratchpad: RenderScratchpad
  ): Promise<ContentComponentResult> {
    assert(contests.length > 0);
    const pageNumber = numPages - contests.length + 1;
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
    return ok({
      currentPageElement: bubbles,
      leftoverContests: contests.slice(1),
    });
  }

  return {
    stylesComponent: BaseStyles,
    frameComponent: BallotPageFrame,
    contestsForBallot: (props) => props.election.contests,
    contentComponent: BallotPageContent,
    isAllBubbleBallot: true,
  };
}
