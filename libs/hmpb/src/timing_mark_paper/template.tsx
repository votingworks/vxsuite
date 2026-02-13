import { ballotPaperDimensions, HmpbBallotPaperSize } from '@votingworks/types';
import React from 'react';
import { Page, pageMarginsInches, TimingMarkGrid } from '../ballot_components';
import { BaseStyles } from '../base_styles';
import { RenderDocument, Renderer } from '../renderer';

export type TimingMarkPaperType = 'standard' | 'qa-overlay';

/**
 * Renders a page of the given size that has the timing mark border of a ballot
 * for that paper size, but with no other content.
 */
export async function render(
  renderer: Renderer,
  paperSize: HmpbBallotPaperSize,
  timingMarkPaperType: TimingMarkPaperType = 'standard'
): Promise<RenderDocument> {
  const scratchpad = await renderer.createScratchpad(<BaseStyles />);
  const document = scratchpad.convertToDocument();

  const dimensions = ballotPaperDimensions(paperSize);
  await document.setContent(
    'body',
    <Page pageNumber={1} dimensions={dimensions} margins={pageMarginsInches}>
      <TimingMarkGrid
        pageDimensions={dimensions}
        ballotMode="test"
        timingMarkStyle={
          timingMarkPaperType === 'standard'
            ? undefined
            : { backgroundColor: 'red' }
        }
      >
        {/* No content since we only want the timing marks themselves. */}
        <React.Fragment />
      </TimingMarkGrid>
    </Page>
  );

  return document;
}
