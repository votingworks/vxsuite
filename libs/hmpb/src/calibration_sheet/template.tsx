import React from 'react';
import { ballotPaperDimensions, BallotPaperSize } from '@votingworks/types';
import { BaseStyles } from '../base_styles';
import { RenderDocument, Renderer } from '../renderer';
import { Page, pageMarginsInches } from '../ballot_components';

export async function render(
  renderer: Renderer,
  paperSize: BallotPaperSize
): Promise<RenderDocument> {
  const scratchpad = await renderer.createScratchpad(<BaseStyles />);
  const document = scratchpad.convertToDocument();
  const dimensions = ballotPaperDimensions(paperSize);
  await document.setContent(
    'body',
    <Page pageNumber={1} dimensions={dimensions} margins={pageMarginsInches}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'end',
          height: '100%',
          paddingBottom: '10%',
        }}
      >
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '45px' }}>⬆</span>
          <h1>Insert Calibration Sheet into VxScan</h1>
          <span style={{ fontSize: '45px' }}>⬆</span>
        </div>
      </div>
    </Page>
  );
  return document;
}
