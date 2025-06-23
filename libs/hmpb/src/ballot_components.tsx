import styled from 'styled-components';
import React from 'react';
import {
  BALLOT_HASH_DISPLAY_LENGTH,
  BallotMode,
  BallotStyle,
  BallotStyleId,
  Election,
  getBallotStyle,
  getPartyForBallotStyle,
  Outset,
  PrecinctId,
} from '@votingworks/types';
import { assertDefined, find, range, unique } from '@votingworks/basics';
import {
  electionStrings,
  InEnglish,
  useLanguageContext,
} from '@votingworks/ui';
import {
  format,
  getPrecinctsAndSplitsForBallotStyle,
} from '@votingworks/utils';
import { InchDimensions, InchMargins } from './types';
import { hmpbStrings } from './hmpb_strings';
import {
  ArrowRightCircle,
  InstructionsDiagramFillBubble,
  InstructionsDiagramWriteIn,
} from './svg_assets';
import { baseLineHeight } from './base_styles';

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
  WHITE: '#FFFFFF',
  LIGHT_GRAY: '#EDEDED',
  DARK_GRAY: '#DADADA',
  DARKER_GRAY: '#B0B0B0',
  INVERSE_GRAY: '#4A4A4A',
} as const;

export function primaryLanguageCode(ballotStyle: BallotStyle): string {
  return ballotStyle.languages?.[0] ?? 'en';
}

export const TIMING_MARK_DIMENSIONS: InchDimensions = {
  width: 0.1875,
  height: 0.0625,
};

const StyledTimingMark = styled.div<{ hidden?: boolean }>`
  width: ${TIMING_MARK_DIMENSIONS.width}in;
  height: ${TIMING_MARK_DIMENSIONS.height}in;
  background-color: black;
  visibility: ${(p) => (p.hidden ? 'hidden' : undefined)};
`;

export const TIMING_MARK_CLASS = 'timing-mark';

export function TimingMark({
  hidden,
  style,
}: {
  hidden?: boolean;
  style?: React.CSSProperties;
}): JSX.Element {
  return (
    <StyledTimingMark
      className={TIMING_MARK_CLASS}
      hidden={hidden}
      style={style}
    />
  );
}

export function timingMarkCounts(pageDimensions: InchDimensions): {
  x: number;
  y: number;
} {
  // Corresponds to the NH Accuvote ballot grid, which we mimic so that our
  // interpreter can support both Accuvote-style ballots and our ballots.
  // This formula is replicated in
  // libs/ballot-interpreter/src/bubble-ballot-rust/ballot_card.rs.
  const columnsPerInch = 4;
  const rowsPerInch = 4;

  return {
    x: pageDimensions.width * columnsPerInch,
    y: pageDimensions.height * rowsPerInch - 3,
  };
}

export function TimingMarkGrid({
  pageDimensions,
  children,
  ballotMode,
  timingMarkStyle,
}: {
  pageDimensions: InchDimensions;
  children: React.ReactNode;
  ballotMode: BallotMode;
  timingMarkStyle?: React.CSSProperties;
}): JSX.Element {
  const markCounts = timingMarkCounts(pageDimensions);
  const hideTimingMarks = ballotMode === 'sample';

  function TimingMarkRow() {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        {range(0, markCounts.x).map((i) => (
          <TimingMark
            key={i}
            style={timingMarkStyle}
            hidden={hideTimingMarks}
          />
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
        {range(0, markCounts.y).map((i) => (
          <TimingMark
            key={i}
            hidden={hideTimingMarks}
            style={timingMarkStyle}
          />
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

export const BUBBLE_HEIGHT_PX = 13;
export const BUBBLE_WIDTH_PX = 19;

export const BubbleShape = styled.div<{ isFilled?: boolean }>`
  width: ${BUBBLE_WIDTH_PX}px;
  height: ${BUBBLE_HEIGHT_PX}px;
  border-radius: 7px;
  border: 1px solid black;
  background-color: ${(p) => (p.isFilled ? 'black' : undefined)};
`;

export const BUBBLE_CLASS = 'bubble';

export type OptionInfo =
  | {
      type: 'option';
      contestId: string;
      optionId: string;
      partyIds?: readonly string[];
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

export function AlignedBubble({
  compact,
  optionInfo,
}: {
  compact?: boolean;
  optionInfo: OptionInfo;
}): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        // Match line-height of text to align bubble to center of first line of
        // option label
        height: `${baseLineHeight(compact)}rem`,
      }}
    >
      <Bubble optionInfo={optionInfo} />
    </div>
  );
}

export const CANDIDATE_OPTION_CLASS = 'candidate-option';

export const WRITE_IN_OPTION_CLASS = 'write-in-option';

export const BALLOT_MEASURE_OPTION_CLASS = 'ballot-measure-option';

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

export const Box = styled.div<{
  fill?: 'transparent' | 'tinted';
}>`
  border: 1px solid ${Colors.BLACK};
  border-top-width: 3px;
  padding: 0.75rem;
  background-color: ${(p) =>
    p.fill === 'tinted' ? Colors.LIGHT_GRAY : 'none'};
`;

export function WriteInLabel(): React.ReactElement {
  return (
    <DualLanguageText delimiter="/">{hmpbStrings.hmpbWriteIn}</DualLanguageText>
  );
}

export function Instructions({
  languageCode,
  bubbleSide = 'left',
}: {
  languageCode?: string;
  bubbleSide?: 'left' | 'right';
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
          gridTemplateColumns: '1fr 7rem 1.9fr 7.5rem',
        }}
      >
        <div>
          <h2>{hmpbStrings.hmpbInstructions}</h2>
          <h4>{hmpbStrings.hmpbInstructionsToVoteTitle}</h4>
          <div>{hmpbStrings.hmpbInstructionsToVoteText}</div>
        </div>
        <div style={{ alignSelf: 'center' }}>
          <InstructionsDiagramFillBubble bubbleSide={bubbleSide} />
        </div>

        <div>
          <h4>{hmpbStrings.hmpbInstructionsWriteInTitle}</h4>
          <div>{hmpbStrings.hmpbInstructionsWriteInText}</div>
        </div>
        <div style={{ alignSelf: 'center' }}>
          <InstructionsDiagramWriteIn
            writeInLabel={<WriteInLabel />}
            bubbleSide={bubbleSide}
          />
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
        <InstructionsDiagramFillBubble bubbleSide={bubbleSide} />
      </div>
      <DualLanguageText>
        <div>
          <b>{hmpbStrings.hmpbInstructionsToVoteTitle}</b>
          <div>{hmpbStrings.hmpbInstructionsToVoteText}</div>
        </div>
      </DualLanguageText>

      {/* Row 3 */}
      <div style={{ alignSelf: 'center' }}>
        <InstructionsDiagramWriteIn
          writeInLabel={<WriteInLabel />}
          bubbleSide={bubbleSide}
        />
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

export function PrecinctOrSplitName({
  election,
  ballotStyleId,
  precinctId,
}: {
  election: Election;
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
}): JSX.Element {
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  const ballotStylePrecinctsAndSplits = getPrecinctsAndSplitsForBallotStyle({
    election,
    ballotStyle,
  });
  const precinctOrSplit = find(
    ballotStylePrecinctsAndSplits,
    (p) => p.precinct.id === precinctId
  );
  return precinctOrSplit.split
    ? electionStrings.precinctSplitName(precinctOrSplit.split)
    : electionStrings.precinctName(precinctOrSplit.precinct);
}

export const FooterRow = styled.div`
  display: flex;
  gap: 0.75rem;
`;

export const FooterBox = styled(Box).attrs({ fill: 'tinted' })`
  padding: 0.25rem 0.5rem;
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export function FooterPageNumber({
  pageNumber,
  totalPages,
}: {
  pageNumber: number;
  totalPages?: number;
}): JSX.Element | null {
  if (totalPages === undefined) {
    return null;
  }

  return (
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
  );
}

export function FooterVoterInstruction({
  pageNumber,
  totalPages,
}: {
  pageNumber: number;
  totalPages?: number;
}): JSX.Element | null {
  if (totalPages === undefined) {
    return null;
  }

  if (pageNumber === totalPages) {
    return (
      <div style={{ textAlign: 'right' }}>
        <DualLanguageText>
          <h3>{hmpbStrings.hmpbVotingComplete}</h3>
        </DualLanguageText>
      </div>
    );
  }

  return (
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
}

export function FooterMetadata({
  election,
  ballotStyleId,
  precinctId,
  electionTitleOverride,
}: {
  election: Election;
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  electionTitleOverride?: React.ReactNode;
}): JSX.Element {
  const party = getPartyForBallotStyle({ election, ballotStyleId });

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

  return (
    <InEnglish>
      <div
        style={{
          fontSize: '8pt',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '0.5rem',
          borderWidth: '1px',
          marginTop: '0.325rem',
          // There's padding at the bottom of the timing mark grid that we
          // want to eat into a little bit here.
          marginBottom: '-0.075in',
          fontWeight: 'bold',
        }}
      >
        <div>
          <BallotHashSlot /> &bull;{' '}
          {electionTitleOverride ?? electionStrings.electionTitle(election)},{' '}
          {electionStrings.electionDate(election)} &bull;{' '}
          {electionStrings.countyName(election.county)},{' '}
          {electionStrings.stateName(election)}
        </div>
        <div>
          <PrecinctOrSplitName
            election={election}
            precinctId={precinctId}
            ballotStyleId={ballotStyleId}
          />{' '}
          &bull;
          {party && (
            <React.Fragment>
              {' '}
              {electionStrings.partyName(party)} &bull;
            </React.Fragment>
          )}{' '}
          {languageText}
        </div>
      </div>
    </InEnglish>
  );
}

export function Footer({
  election,
  ballotStyleId,
  precinctId,
  pageNumber,
  totalPages,
  electionTitleOverride,
}: {
  election: Election;
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  pageNumber: number;
  totalPages?: number;
  electionTitleOverride?: React.ReactNode;
}): JSX.Element {
  return (
    <div>
      <FooterRow>
        <QrCodeSlot />
        <FooterBox>
          <FooterPageNumber pageNumber={pageNumber} totalPages={totalPages} />
          <FooterVoterInstruction
            pageNumber={pageNumber}
            totalPages={totalPages}
          />
        </FooterBox>
      </FooterRow>
      <FooterMetadata
        election={election}
        ballotStyleId={ballotStyleId}
        precinctId={precinctId}
        electionTitleOverride={electionTitleOverride}
      />
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

export const ContestTitle = 'h3';
