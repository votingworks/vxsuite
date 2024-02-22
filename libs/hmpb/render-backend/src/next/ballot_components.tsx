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
  background-color: black;
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

export const QR_CODE_SIZE: InchDimensions = {
  width: 0.6,
  height: 0.6,
};

export function QrCodeSlot(): JSX.Element {
  return (
    <div
      className={QR_CODE_SLOT_CLASS}
      style={{
        height: `${QR_CODE_SIZE.height}in`,
        width: `${QR_CODE_SIZE.width}in`,
      }}
    />
  );
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
  className,
}: {
  contestId: string;
  optionId: string;
  className?: string;
}): JSX.Element {
  return (
    <StyledBubble
      className={[BUBBLE_CLASS, className].join(' ')}
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
        paddingTop: `${margins.top}in`,
        paddingRight: `${margins.right}in`,
        paddingBottom: `${margins.bottom}in`,
        paddingLeft: `${margins.left}in`,
        backgroundColor: 'white',
      }}
    >
      <div style={{ height: '100%' }}>{children}</div>
    </div>
  );
}
