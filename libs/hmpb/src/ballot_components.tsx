import styled from 'styled-components';
import React from 'react';
import { ELECTION_HASH_DISPLAY_LENGTH, Outset } from '@votingworks/types';
import { range } from '@votingworks/basics';
import { InchDimensions, InchMargins } from './types';

/**
 * Include 5mm margins by default to create room for an imprinting ID
 * Margins meet or exceed 404 and 4001 series HP printer recommendations.
 */
export const pageMarginsInches = {
  top: 0.16667, // 12pt
  bottom: 0.16667, // 12pt
  right: 0.19685, // 5mm
  left: 0.19685, // 5mm
} as const;

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

export function TimingMarkGrid({
  pageDimensions,
  children,
}: {
  pageDimensions: InchDimensions;
  children: React.ReactNode;
}): JSX.Element {
  // Corresponds to the NH Accuvote ballot grid, which we mimic so that our
  // interpreter can support both Accuvote-style ballots and our ballots.
  // This formula is replicated in libs/ballot-interpreter/src/ballot_card.rs.
  const columnsPerInch = 4;
  const rowsPerInch = 4;
  const gridRows = pageDimensions.height * rowsPerInch - 3;
  const gridColumns = pageDimensions.width * columnsPerInch;

  function TimingMarkRow() {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        {range(0, gridColumns).map((i) => (
          <TimingMark key={i} />
        ))}
      </div>
    );
  }

  function TimingMarkColumn({ style }: { style: React.CSSProperties }) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'absolute',
          top: `-${TIMING_MARK_DIMENSIONS.height}in`,
          height: `calc(100% + ${2 * TIMING_MARK_DIMENSIONS.height}in)`,
          ...style,
        }}
      >
        {range(0, gridRows).map((i) => (
          <TimingMark key={i} />
        ))}
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <TimingMarkRow />
      <div
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          padding: `0 ${TIMING_MARK_DIMENSIONS.width}in`,
        }}
      >
        <TimingMarkColumn style={{ left: 0 }} />
        {children}
        <TimingMarkColumn style={{ right: 0 }} />
      </div>
      <TimingMarkRow />
    </div>
  );
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
    >
      <div style={{ border: '1px solid black', height: '100%' }} />
    </div>
  );
}

export const ELECTION_HASH_SLOT_CLASS = 'election-hash-slot';

export function ElectionHashSlot(): JSX.Element {
  return (
    <span className={ELECTION_HASH_SLOT_CLASS}>
      {range(0, ELECTION_HASH_DISPLAY_LENGTH)
        .map(() => '0')
        .join('')}
    </span>
  );
}

const BUBBLE_DIMENSIONS: InchDimensions = {
  width: 0.2,
  height: 0.13,
};

export const BubbleShape = styled.div<{ isFilled?: boolean }>`
  width: ${BUBBLE_DIMENSIONS.width}in;
  height: ${BUBBLE_DIMENSIONS.height}in;
  border-radius: 0.7in;
  border: 1px solid black;
  background-color: ${(p) => (p.isFilled ? 'black' : undefined)};
`;

export const BUBBLE_CLASS = 'bubble';

export type OptionInfo =
  | {
      type: 'option';
      contestId: string;
      optionId: string;
    }
  | {
      type: 'write-in';
      contestId: string;
      writeInIndex: number;
      writeInArea: Outset<number>; // Grid coordinates for write-in space in relation to the bubble
    };

export function Bubble({
  optionInfo,
  className,
}: {
  optionInfo: OptionInfo;
  className?: string;
}): JSX.Element {
  return (
    <BubbleShape
      className={[BUBBLE_CLASS, className].join(' ')}
      data-option-info={JSON.stringify(optionInfo)}
    />
  );
}

export const WRITE_IN_OPTION_CLASS = 'write-in-option';

export const MARK_OVERLAY_CLASS = 'mark-overlay';

export function MarkOverlay({
  children,
}: {
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <div
      className={MARK_OVERLAY_CLASS}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
      }}
    >
      {children}
    </div>
  );
}

export const PAGE_CLASS = 'page';

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
        position: 'relative',
      }}
    >
      <MarkOverlay />
      <div style={{ height: '100%' }}>{children}</div>
    </div>
  );
}
