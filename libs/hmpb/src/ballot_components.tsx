import styled from 'styled-components';
import React from 'react';
import {
  BALLOT_HASH_DISPLAY_LENGTH,
  BallotStyle,
  BallotStyleId,
  Election,
  getBallotStyle,
  getPrecinctById,
  Outset,
  PrecinctId,
} from '@votingworks/types';
import { assertDefined, range, unique } from '@votingworks/basics';
import { InEnglish, useLanguageContext } from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { InchDimensions, InchMargins } from './types';
import { hmpbStrings } from './hmpb_strings';
import {
  ArrowRightCircle,
  InstructionsDiagramFillBubble,
  InstructionsDiagramWriteIn,
} from './svg_assets';

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

export const Colors = {
  BLACK: '#000000',
  LIGHT_GRAY: '#EDEDED',
  DARK_GRAY: '#DADADA',
  DARKER_GRAY: '#B0B0B0',
} as const;

export function primaryLanguageCode(ballotStyle: BallotStyle): string {
  return ballotStyle.languages?.[0] ?? 'en';
}

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

export const BALLOT_HASH_SLOT_CLASS = 'ballot-hash-slot';

export function BallotHashSlot(): JSX.Element {
  return (
    <span className={BALLOT_HASH_SLOT_CLASS}>
      {range(0, BALLOT_HASH_DISPLAY_LENGTH)
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

export function BubbleWrapper({
  optionInfo,
  style = {},
}: {
  optionInfo: OptionInfo;
  style: React.CSSProperties;
}): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        ...style,
      }}
    >
      <Bubble optionInfo={optionInfo} />
    </div>
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

/**
 * Flex row that adds delimiters between each child element. However, if a child
 * element wraps to the next line, omits the delimiter before that element.
 */
const DelimitedOrWrapped = styled.div<{ delimiter: string }>`
  display: flex;
  flex-wrap: wrap;
  /* Hide the overflow of the container so that a child's delimiter is hidden if
   * the child is at the beginning of a line */
  overflow: hidden;
  position: relative;

  /* Add delimiter before each child */
  > *:before {
    content: '${(p) => p.delimiter}';
    /* Absolute position takes it out of the flow so it can overflow to the left
     * of the container */
    position: absolute;
    margin-left: -0.8em;
    /* Use a fixed width that's based on the font size of the children */
    width: 0.8em;
    text-align: center;
  }
  /* Create a space between the children for the delimiter to go */
  > *:not(:last-child) {
    margin-right: 0.8em;
  }
`;

/**
 * Must be rendered within a LanguageContext
 */
export function DualLanguageText({
  children,
  delimiter,
}: {
  children: React.ReactNode;
  delimiter?: string;
}): React.ReactNode {
  const languageContext = useLanguageContext();
  if (!languageContext || languageContext.currentLanguageCode === 'en') {
    return children;
  }

  const text = (
    <React.Fragment>
      {children}
      <InEnglish>{children}</InEnglish>
    </React.Fragment>
  );

  if (delimiter) {
    return (
      <DelimitedOrWrapped delimiter={delimiter}>{text}</DelimitedOrWrapped>
    );
  }
  return text;
}

export function BlankPageMessage(): React.ReactElement {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <DualLanguageText>
          <h1>{hmpbStrings.hmpbPageIntentionallyBlank}</h1>
        </DualLanguageText>
      </div>
    </div>
  );
}

export const Box = styled.div<{ fill?: 'transparent' | 'tinted' }>`
  border: 1px solid ${Colors.BLACK};
  border-top-width: 3px;
  padding: 0.75rem;
  background-color: ${(p) =>
    p.fill === 'tinted' ? Colors.LIGHT_GRAY : 'none'};
`;

export function WriteInLabel(): React.ReactElement {
  return (
    <span>
      <DualLanguageText delimiter="/">
        {hmpbStrings.hmpbWriteIn}
      </DualLanguageText>
    </span>
  );
}

export function Instructions({
  languageCode,
}: {
  languageCode?: string;
}): React.ReactElement {
  // To minimize vertical space used, we do a slightly different layout for
  // English-only vs bilingual ballots.
  if (!languageCode || languageCode === 'en') {
    return (
      <Box
        fill="tinted"
        style={{
          padding: '0.5rem 0.5rem',
          display: 'grid',
          gap: '0.125rem 0.75rem',
          gridTemplateColumns: '1fr 7rem 1.8fr 8rem',
        }}
      >
        <div>
          <h2>{hmpbStrings.hmpbInstructions}</h2>
          <h4>{hmpbStrings.hmpbInstructionsToVoteTitle}</h4>
          <div>{hmpbStrings.hmpbInstructionsToVoteText}</div>
        </div>
        <div style={{ alignSelf: 'center' }}>
          <InstructionsDiagramFillBubble />
        </div>

        <div>
          <h4>{hmpbStrings.hmpbInstructionsWriteInTitle}</h4>
          <div>{hmpbStrings.hmpbInstructionsWriteInText}</div>
        </div>
        <div style={{ alignSelf: 'center' }}>
          <InstructionsDiagramWriteIn writeInLabel={<WriteInLabel />} />
        </div>
      </Box>
    );
  }

  return (
    <Box
      fill="tinted"
      style={{
        padding: '0.5rem 0.5rem',
        display: 'grid',
        gap: '0.125rem 0.75rem',
        gridTemplateColumns: '7.5rem 1fr 1fr',
      }}
    >
      {/* Row 1 */}
      <div />
      <DualLanguageText>
        <h2>{hmpbStrings.hmpbInstructions}</h2>
      </DualLanguageText>

      {/* Row 2 */}
      <div style={{ alignSelf: 'center' }}>
        <InstructionsDiagramFillBubble />
      </div>
      <DualLanguageText>
        <div>
          <b>{hmpbStrings.hmpbInstructionsToVoteTitle}</b>
          <div>{hmpbStrings.hmpbInstructionsToVoteText}</div>
        </div>
      </DualLanguageText>

      {/* Row 3 */}
      <div style={{ alignSelf: 'center' }}>
        <InstructionsDiagramWriteIn writeInLabel={<WriteInLabel />} />
      </div>
      <DualLanguageText>
        <div>
          <b>{hmpbStrings.hmpbInstructionsWriteInTitle}</b>
          <div>{hmpbStrings.hmpbInstructionsWriteInText}</div>
        </div>
      </DualLanguageText>
    </Box>
  );
}

export function Footer({
  election,
  ballotStyleId,
  precinctId,
  pageNumber,
  totalPages,
}: {
  election: Election;
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  pageNumber: number;
  totalPages: number;
}): JSX.Element {
  const precinct = assertDefined(getPrecinctById({ election, precinctId }));
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  const languageCode = primaryLanguageCode(
    assertDefined(getBallotStyle({ election, ballotStyleId }))
  );
  const languageText = unique([languageCode, 'en'])
    .map((code) =>
      format.languageDisplayName({
        languageCode: code,
        displayLanguageCode: 'en',
      })
    )
    .join(' / ');

  const continueVoting = (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center',
      }}
    >
      <div style={{ textAlign: 'right' }}>
        <DualLanguageText>
          <h3>
            {pageNumber % 2 === 1
              ? hmpbStrings.hmpbContinueVotingOnBack
              : hmpbStrings.hmpbContinueVotingOnNextSheet}
          </h3>
        </DualLanguageText>
      </div>
      <ArrowRightCircle style={{ height: '2rem' }} />
    </div>
  );
  const ballotComplete = (
    <div style={{ textAlign: 'right' }}>
      <DualLanguageText>
        <h3>{hmpbStrings.hmpbVotingComplete}</h3>
      </DualLanguageText>
    </div>
  );
  const endOfPageInstruction =
    pageNumber === totalPages ? ballotComplete : continueVoting;

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <QrCodeSlot />
        <Box
          fill="tinted"
          style={{
            padding: '0.25rem 0.5rem',
            flex: 1,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '0.85rem' }}>
              <DualLanguageText delimiter="/">
                {hmpbStrings.hmpbPage}
              </DualLanguageText>
            </div>
            <h1>
              {pageNumber}/{totalPages}
            </h1>
          </div>
          <div>{endOfPageInstruction}</div>
        </Box>
      </div>
      {pageNumber % 2 === 1 && (
        <div
          style={{
            fontSize: '8pt',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '0.5rem',
            borderWidth: '1px',
            marginTop: '0.325rem',
            // There's padding at the bottom of the timing mark grid that we
            // want to eat into a little bit here, so we set a height that's
            // slightly smaller than the actual height of this text and let it
            // overflow a bit.
            height: '0.5rem',
          }}
        >
          <span>
            Election:{' '}
            <b>
              <BallotHashSlot />
            </b>
          </span>
          <span>
            Ballot Style: <b>{ballotStyle.groupId}</b>
          </span>
          <span>
            Precinct: <b>{precinct.name}</b>
          </span>
          <span>
            Language: <b>{languageText}</b>
          </span>
        </div>
      )}
    </div>
  );
}

interface ContestHeaderProps {
  compact?: boolean;
}

export const ContestHeader = styled.div<ContestHeaderProps>`
  background: ${Colors.LIGHT_GRAY};
  padding: ${(p) => (p.compact ? '0.25rem 0.5rem' : '0.5rem')};
`;
