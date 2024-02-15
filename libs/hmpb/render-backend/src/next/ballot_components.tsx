import styled from 'styled-components';
import React from 'react';
import { InchDimensions, InchMargins } from './types';

export const TIMING_MARK_DIMENSIONS: InchDimensions = {
  width: 0.1875,
  height: 0.0625,
};

const StyledTimingMark = styled.div`
  width: ${TIMING_MARK_DIMENSIONS.width}in;
  height: ${TIMING_MARK_DIMENSIONS.height}in;
  backgroundcolor: black;
`;

export const TIMING_MARK_CLASS = 'timing-mark';

export function TimingMark(): JSX.Element {
  return <StyledTimingMark className={TIMING_MARK_CLASS} />;
}

export const CONTENT_SLOT_CLASS = 'content-slot';

export function ContentSlot(): JSX.Element {
  return (
    <div
      className={CONTENT_SLOT_CLASS}
      style={{ height: '100%', width: '100%' }}
    />
  );
}

export const QR_CODE_SLOT_CLASS = 'qr-code-slot';

export function QrCodeSlot(): JSX.Element {
  return <div className={QR_CODE_SLOT_CLASS} />;
}

const BUBBLE_DIMENSIONS: InchDimensions = {
  width: 0.2,
  height: 0.13,
};

const StyledBubble = styled.div`
  width: ${BUBBLE_DIMENSIONS.width}in;
  height: ${BUBBLE_DIMENSIONS.height}in;
  border-radius: 0.7in;
  border: 1px solid black;
`;

export const BUBBLE_CLASS = 'bubble';

export function Bubble({
  contestId,
  optionId,
}: {
  contestId: string;
  optionId: string;
}): JSX.Element {
  return (
    <StyledBubble
      className={BUBBLE_CLASS}
      data-contest-id={contestId}
      data-option-id={optionId}
    />
  );
}

export const PAGE_CLASS = 'Page';

export function Page({
  pageNumber,
  dimensions,
  margins,
  children,
}: {
  pageNumber: number;
  dimensions: InchDimensions;
  margins: InchMargins;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div
      className={PAGE_CLASS}
      data-page-number={pageNumber}
      style={{
        width: `${dimensions.width}in`,
        height: `${dimensions.height}in`,
        paddingLeft: `${margins.left}in`,
        paddingRight: `${margins.right}in`,
        paddingTop: `${margins.top}in`,
        paddingBottom: `${margins.bottom}in`,
        breakAfter: 'page',
      }}
    >
      <div style={{ height: '100%', overflow: 'hidden' }}>{children}</div>
    </div>
  );
}
