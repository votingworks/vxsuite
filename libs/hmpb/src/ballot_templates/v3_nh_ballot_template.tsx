/* istanbul ignore file - must be manually tested against v3 interpreter @preserve */
import {
  assertDefined,
  iter,
  range,
  throwIllegalValue,
} from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import {
  AnyContest,
  BallotStyleId,
  BallotType,
  CandidateContest as CandidateContestStruct,
  Election,
  YesNoContest,
  ballotPaperDimensions,
  getBallotStyle,
  getContests,
  getPartyForBallotStyle,
} from '@votingworks/types';
import {
  BackendLanguageContextProvider,
  CandidatePartyList,
  electionStrings,
  RichText,
} from '@votingworks/ui';
import styled from 'styled-components';
import React from 'react';
import {
  BallotPageTemplate,
  BaseBallotProps,
  PagedElementResult,
} from '../render_ballot';
import { RenderScratchpad } from '../renderer';
import {
  Bubble,
  OptionInfo,
  Page,
  TIMING_MARK_DIMENSIONS,
  TimingMarkGrid,
  WRITE_IN_OPTION_CLASS,
  pageMarginsInches,
  BlankPageMessage,
  DualLanguageText,
  Footer,
  Instructions,
  primaryLanguageCode,
} from '../ballot_components';
import { BallotMode, PixelDimensions } from '../types';
import { hmpbStrings } from '../hmpb_strings';
import { layOutInColumns } from '../layout_in_columns';
import { NhPrecinctSplitOptions } from './nh_ballot_template';

const Colors = {
  BLACK: '#000000',
  LIGHT_GRAY: '#EDEDED',
  DARK_GRAY: '#DADADA',
  DARKER_GRAY: '#B0B0B0',
} as const;

const Box = styled.div<{ fill?: 'transparent' | 'tinted' }>`
  border: 1px solid ${Colors.BLACK};
  border-top-width: 3px;
  padding: 0.75rem;
  background-color: ${(p) =>
    p.fill === 'tinted' ? Colors.LIGHT_GRAY : 'none'};
`;

async function snapToGridRow(
  scratchpad: RenderScratchpad,
  gridRowHeightInches: number,
  renderElement: (style: React.CSSProperties) => JSX.Element
) {
  const measurements = await scratchpad.measureElements(
    <div className="wrapper">{renderElement({})}</div>,
    '.wrapper'
  );
  const { height } = measurements[0];
  const gridRowHeightPx = gridRowHeightInches * 96;
  const numRows = Math.ceil(height / gridRowHeightPx);
  const snappedHeight = numRows * gridRowHeightPx;
  return {
    element: renderElement({
      height: `${snappedHeight}px`,
    }),
    height: snappedHeight,
  };
}

function Header({
  election,
  ballotStyleId,
  ballotType,
  ballotMode,

  electionTitleOverride,
  clerkSignatureImage,
  clerkSignatureCaption,
}: {
  election: Election;
  ballotStyleId: BallotStyleId;
  ballotType: BallotType;
  ballotMode: BallotMode;
} & NhPrecinctSplitOptions) {
  const ballotTitles: Record<BallotMode, Record<BallotType, JSX.Element>> = {
    official: {
      [BallotType.Precinct]: hmpbStrings.hmpbOfficialBallot,
      [BallotType.Absentee]: hmpbStrings.hmpbOfficialAbsenteeBallot,
      [BallotType.Provisional]: hmpbStrings.hmpbOfficialProvisionalBallot,
    },
    sample: {
      [BallotType.Precinct]: hmpbStrings.hmpbSampleBallot,
      [BallotType.Absentee]: hmpbStrings.hmpbSampleAbsenteeBallot,
      [BallotType.Provisional]: hmpbStrings.hmpbSampleProvisionalBallot,
    },
    test: {
      [BallotType.Precinct]: hmpbStrings.hmpbTestBallot,
      [BallotType.Absentee]: hmpbStrings.hmpbTestAbsenteeBallot,
      [BallotType.Provisional]: hmpbStrings.hmpbTestProvisionalBallot,
    },
  };
  const ballotTitle = ballotTitles[ballotMode][ballotType];

  const party =
    election.type === 'primary'
      ? assertDefined(getPartyForBallotStyle({ election, ballotStyleId }))
      : undefined;

  return (
    <div
      style={{
        paddingTop: '0.125rem',
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          height: '5rem',
          aspectRatio: '1 / 1',
          backgroundImage: `url(data:image/svg+xml;base64,${Buffer.from(
            election.seal
          ).toString('base64')})`,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          marginTop: '0.125rem',
        }}
      />
      <div style={{ flexGrow: 2 }}>
        <DualLanguageText>
          <div>
            <h1>{ballotTitle}</h1>
            {party && <h1>{electionStrings.partyFullName(party)}</h1>}
            <h2>
              {electionTitleOverride ?? electionStrings.electionTitle(election)}
            </h2>
            <h2>{electionStrings.electionDate(election)}</h2>
            <div>
              {/* TODO comma-delimiting the components of a location doesn't
            necessarily work in all languages. We need to figure out a
            language-aware way to denote hierarchical locations. */}
              {electionStrings.countyName(election.county)},{' '}
              {electionStrings.stateName(election)}
            </div>
          </div>
        </DualLanguageText>
      </div>
      <div style={{ flexGrow: 1 }}>
        {clerkSignatureImage && (
          <div
            style={{
              height: '3rem',
              backgroundImage: `url(data:image/svg+xml;base64,${Buffer.from(
                clerkSignatureImage
              ).toString('base64')})`,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              marginTop: '0.125rem',
            }}
          />
        )}
        {clerkSignatureCaption && <div>{clerkSignatureCaption}</div>}
      </div>
    </div>
  );
}

// Almost identical to vx_default_ballot_template BallotPageFrame except additional props are passed to Header.
function BallotPageFrame({
  election,
  ballotStyleId,
  precinctId,
  ballotType,
  ballotMode,
  pageNumber,
  totalPages,
  children,
  electionTitleOverride,
  clerkSignatureImage,
  clerkSignatureCaption,
}: BaseBallotProps &
  NhPrecinctSplitOptions & {
    pageNumber: number;
    totalPages: number;
    children: JSX.Element;
  }): JSX.Element {
  const pageDimensions = ballotPaperDimensions(election.ballotLayout.paperSize);
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  const languageCode = primaryLanguageCode(ballotStyle);
  return (
    <BackendLanguageContextProvider
      key={pageNumber}
      currentLanguageCode={primaryLanguageCode(ballotStyle)}
      uiStringsPackage={election.ballotStrings}
    >
      <Page
        pageNumber={pageNumber}
        dimensions={pageDimensions}
        margins={pageMarginsInches}
      >
        <TimingMarkGrid pageDimensions={pageDimensions}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              padding: '0.11in 0.125in 0.125in 0.125in',
            }}
          >
            {pageNumber === 1 && (
              <>
                <Header
                  election={election}
                  ballotStyleId={ballotStyleId}
                  ballotType={ballotType}
                  ballotMode={ballotMode}
                  electionTitleOverride={electionTitleOverride}
                  clerkSignatureImage={clerkSignatureImage}
                  clerkSignatureCaption={clerkSignatureCaption}
                />
                <Instructions languageCode={languageCode} />
              </>
            )}
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
            <Footer
              election={election}
              ballotStyleId={ballotStyleId}
              precinctId={precinctId}
              pageNumber={pageNumber}
              totalPages={totalPages}
            />
          </div>
        </TimingMarkGrid>
      </Page>
    </BackendLanguageContextProvider>
  );
}

const ContestHeader = styled.div`
  background: ${Colors.LIGHT_GRAY};
  padding: 0.25rem 0.5rem 0.125rem 0.5rem;
`;

function WriteInLabel() {
  return (
    <span>
      <DualLanguageText delimiter="/">
        {hmpbStrings.hmpbWriteIn}
      </DualLanguageText>
    </span>
  );
}

async function CandidateContest({
  scratchpad,
  key,
  election,
  contest,
  gridRowHeightInches,
  width,
}: {
  scratchpad: RenderScratchpad;
  key: React.Key;
  election: Election;
  contest: CandidateContestStruct;
  gridRowHeightInches: number;
  width: number;
}) {
  const voteForText = {
    1: hmpbStrings.hmpbVoteFor1,
    2: hmpbStrings.hmpbVoteFor2,
    3: hmpbStrings.hmpbVoteFor3,
    4: hmpbStrings.hmpbVoteFor4,
    5: hmpbStrings.hmpbVoteFor5,
    6: hmpbStrings.hmpbVoteFor6,
    7: hmpbStrings.hmpbVoteFor7,
    8: hmpbStrings.hmpbVoteFor8,
    9: hmpbStrings.hmpbVoteFor9,
    10: hmpbStrings.hmpbVoteFor10,
  }[contest.seats];
  if (!voteForText) {
    throw new Error(
      `Unsupported number of seats for contest: ${contest.seats}`
    );
  }

  const contestHeader = await snapToGridRow(
    scratchpad,
    gridRowHeightInches,
    (style) => (
      <ContestHeader style={{ ...style, width }}>
        <DualLanguageText delimiter="/">
          <h3>{electionStrings.contestTitle(contest)}</h3>
        </DualLanguageText>
        <DualLanguageText delimiter="/">
          <div>{voteForText}</div>
        </DualLanguageText>
        {contest.termDescription && (
          <DualLanguageText delimiter="/">
            <div>{electionStrings.contestTerm(contest)}</div>
          </DualLanguageText>
        )}
      </ContestHeader>
    )
  );

  const candidateOptions = await iter(contest.candidates)
    .async()
    .map((candidate) =>
      snapToGridRow(scratchpad, gridRowHeightInches, (style) => {
        const partyText =
          election.type === 'primary' ? undefined : (
            <CandidatePartyList
              candidate={candidate}
              electionParties={election.parties}
            />
          );
        const optionInfo: OptionInfo = {
          type: 'option',
          contestId: contest.id,
          optionId: candidate.id,
        };
        return (
          <div
            key={candidate.id}
            style={{
              padding: '0.375rem 0.75rem 0.125rem 0.5rem',
              borderTop: `1px solid ${Colors.DARK_GRAY}`,
              ...style,
              width,
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
              }}
            >
              <div
                style={{ flex: 1, textAlign: 'right', marginTop: '-0.25rem' }}
              >
                <strong>{candidate.name}</strong>
                {partyText && (
                  <DualLanguageText delimiter="/">
                    <div>{partyText}</div>
                  </DualLanguageText>
                )}
              </div>
              <div>
                <Bubble optionInfo={optionInfo} />
              </div>
            </div>
          </div>
        );
      })
    )
    .toArray();

  const writeInOptions = await iter(
    range(0, contest.allowWriteIns ? contest.seats : 0)
  )
    .async()
    .map((writeInIndex) =>
      snapToGridRow(scratchpad, gridRowHeightInches, (style) => {
        const optionInfo: OptionInfo = {
          type: 'write-in',
          contestId: contest.id,
          writeInIndex,
          writeInArea: {
            top: 0.3,
            right: -0.9,
            bottom: 0.7,
            left: 7.7,
          },
        };
        return (
          <div
            key={writeInIndex}
            className={WRITE_IN_OPTION_CLASS}
            style={{
              display: 'flex',
              gap: '0.5rem',
              padding: '0.375rem 0.75rem 0rem 0.5rem',
              borderTop: `1px solid ${Colors.DARK_GRAY}`,
              ...style,
              width,
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  borderBottom: `1px solid ${Colors.BLACK}`,
                  height: '1.75rem',
                }}
              />
              <div style={{ fontSize: '0.75rem', textAlign: 'right' }}>
                <WriteInLabel />
              </div>
            </div>
            <div>
              <Bubble optionInfo={optionInfo} />
            </div>
          </div>
        );
      })
    )
    .toArray();

  const options = candidateOptions.concat(writeInOptions);

  const contestHeight =
    contestHeader.height + iter(options).sum((option) => option.height);

  return (
    <Box
      key={key}
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
        height: contestHeight,
        width,
        overflow: 'hidden',
      }}
    >
      {contestHeader.element}
      <div>{options.map((option) => option.element)}</div>
    </Box>
  );
}

async function BallotMeasureContest({
  scratchpad,
  key,
  contest,
  gridRowHeightInches,
  width,
}: {
  scratchpad: RenderScratchpad;
  key: React.Key;
  contest: YesNoContest;
  gridRowHeightInches: number;
  width: number;
}) {
  const contestHeader = await snapToGridRow(
    scratchpad,
    gridRowHeightInches,
    (style) => (
      <ContestHeader style={{ ...style, width }}>
        <DualLanguageText delimiter="/">
          <h2>{electionStrings.contestTitle(contest)}</h2>
        </DualLanguageText>
      </ContestHeader>
    )
  );

  const contestDescription = await snapToGridRow(
    scratchpad,
    gridRowHeightInches,
    (style) => (
      <div
        style={{
          padding: '0.5rem 0.5rem 0.25rem 0.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          ...style,
          width,
        }}
      >
        <DualLanguageText>
          <RichText
            tableBorderWidth={'1px'}
            tableBorderColor={Colors.DARKER_GRAY}
            tableHeaderBackgroundColor={Colors.LIGHT_GRAY}
          >
            {electionStrings.contestDescription(contest)}
          </RichText>
        </DualLanguageText>
      </div>
    )
  );

  const options = await iter([contest.yesOption, contest.noOption])
    .async()
    .map((option) =>
      snapToGridRow(scratchpad, gridRowHeightInches, (style) => (
        <div
          key={option.id}
          style={{
            padding: '0.375rem 0.75rem 0.125rem 0.5rem',
            borderTop: `1px solid ${Colors.LIGHT_GRAY}`,
            ...style,
            width,
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <strong
              style={{ flex: 1, textAlign: 'right', marginTop: '-0.25rem' }}
            >
              <DualLanguageText delimiter="/">
                {electionStrings.contestOptionLabel(option)}
              </DualLanguageText>
            </strong>
            <div>
              <Bubble
                optionInfo={{
                  type: 'option',
                  contestId: contest.id,
                  optionId: option.id,
                }}
              />
            </div>
          </div>
        </div>
      ))
    )
    .toArray();

  const contestHeight =
    contestHeader.height +
    contestDescription.height +
    iter(options).sum((option) => option.height);

  return (
    <Box
      key={key}
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
        height: contestHeight,
        width,
        overflow: 'hidden',
      }}
    >
      {contestHeader.element}
      {contestDescription.element}
      {options.map((option) => option.element)}
    </Box>
  );
}

async function Contest({
  scratchpad,
  key,
  contest,
  election,
  gridRowHeightInches,
  width,
}: {
  scratchpad: RenderScratchpad;
  key: React.Key;
  contest: AnyContest;
  election: Election;
  gridRowHeightInches: number;
  width: number;
}) {
  switch (contest.type) {
    case 'candidate':
      return CandidateContest({
        scratchpad,
        key,
        election,
        contest,
        gridRowHeightInches,
        width,
      });
    case 'yesno':
      return BallotMeasureContest({
        scratchpad,
        key,
        contest,
        gridRowHeightInches,
        width,
      });
    default:
      return throwIllegalValue(contest);
  }
}

async function BallotPageContent(
  props: (BaseBallotProps & { dimensions: PixelDimensions }) | undefined,
  scratchpad: RenderScratchpad
): Promise<PagedElementResult<BaseBallotProps>> {
  if (!props) {
    return {
      currentPageElement: <BlankPageMessage />,
      nextPageProps: undefined,
    };
  }

  const { election, ballotStyleId, dimensions, ...restProps } = props;
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  // For now, just one section for candidate contests, one for ballot measures.
  // TODO support arbitrarily defined sections
  const contests = getContests({ election, ballotStyle });
  if (contests.length === 0) {
    throw new Error('No contests assigned to this precinct.');
  }
  const contestSections = iter(contests)
    .partition((contest) => contest.type === 'candidate')
    .filter((section) => section.length > 0);

  const pageDimensions = ballotPaperDimensions(election.ballotLayout.paperSize);
  const ppi = 96;
  // Copied from TimingMarkGrid component
  const columnsPerInch = 4;
  const rowsPerInch = 4;
  const gridRows = pageDimensions.height * rowsPerInch - 3 - 1;
  const gridColumns = pageDimensions.width * columnsPerInch - 1;
  const gridHeightInches =
    pageDimensions.height -
    (pageMarginsInches.top + pageMarginsInches.bottom) -
    TIMING_MARK_DIMENSIONS.height;
  const gridWidthInches =
    pageDimensions.width -
    (pageMarginsInches.left + pageMarginsInches.right) -
    TIMING_MARK_DIMENSIONS.width;
  const gridRowHeightInches = gridHeightInches / gridRows;
  const gridColumnWidthInches = gridWidthInches / gridColumns;

  // Add as many contests on this page as will fit.
  const contestSectionsLeftToLayout = contestSections;
  const pageSections: JSX.Element[] = [];
  let heightUsed = 0;

  // TODO is there some way we can use rem here instead of having to know the
  // font size and map to px?
  const horizontalGapPx = gridColumnWidthInches * ppi;
  const verticalGapPx = gridRowHeightInches * ppi;
  while (contestSections.length > 0 && heightUsed < dimensions.height) {
    const section = assertDefined(contestSectionsLeftToLayout.shift());
    const numColumns = section[0].type === 'candidate' ? 3 : 2;
    const contestGridColumnsTotal = Math.floor(
      (dimensions.width - horizontalGapPx * (numColumns - 1)) /
        (gridColumnWidthInches * ppi)
    );
    const columnGridWidth = Math.floor(contestGridColumnsTotal / numColumns);
    const columnWidthPx = columnGridWidth * gridColumnWidthInches * ppi;
    const contestElements = await iter(section)
      .async()
      .map((contest, i) =>
        Contest({
          scratchpad,
          key: i,
          contest,
          election,
          gridRowHeightInches,
          width: columnWidthPx,
        })
      )
      .toArray();
    const contestMeasurements = await scratchpad.measureElements(
      <BackendLanguageContextProvider
        currentLanguageCode={primaryLanguageCode(ballotStyle)}
        uiStringsPackage={election.ballotStrings}
      >
        {contestElements.map((contest, i) => (
          <div
            className="contestWrapper"
            key={i}
            style={{ width: `${columnWidthPx}px` }}
          >
            {contest}
          </div>
        ))}
      </BackendLanguageContextProvider>,
      '.contestWrapper'
    );

    const measuredContests = iter(contestElements)
      .zip(contestMeasurements)
      .map(([element, measurements], i) => ({
        element,
        ...measurements,
        contest: section[i],
      }))
      .toArray();

    const { columns, height, leftoverElements } = layOutInColumns({
      elements: measuredContests,
      numColumns,
      maxColumnHeight: dimensions.height - heightUsed,
      elementGap: verticalGapPx,
    });

    // Put leftover elements back on the front of the queue
    if (leftoverElements.length > 0) {
      contestSectionsLeftToLayout.unshift(
        leftoverElements.map((element) => element.contest)
      );
    }

    // If there wasn't enough room left for any contests, go to the next page
    if (height === 0) {
      break;
    }

    // Add vertical gap to account for space between sections
    heightUsed += height + verticalGapPx;
    pageSections.push(
      <div
        key={`section-${pageSections.length + 1}`}
        style={{
          display: 'flex',
          gap: `${horizontalGapPx}px`,
        }}
      >
        {columns.map((column, i) => (
          <div
            key={`column-${i}`}
            style={{
              // flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: `${verticalGapPx}px`,
              width: `${columnWidthPx}px`,
              overflow: 'hidden',
            }}
          >
            {column.map(({ element }) => element)}
          </div>
        ))}
      </div>
    );
  }

  const currentPageElement =
    pageSections.length > 0 ? (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: `${verticalGapPx}px`,
        }}
      >
        {pageSections}
      </div>
    ) : (
      <BlankPageMessage />
    );
  const nextPageProps =
    contestSectionsLeftToLayout.length > 0
      ? {
          ...restProps,
          ballotStyleId,
          election: {
            ...election,
            contests: contestSectionsLeftToLayout.flat(),
          },
        }
      : undefined;

  return {
    currentPageElement,
    nextPageProps,
  };
}

interface BallotPageTemplateV3 extends BallotPageTemplate<BaseBallotProps> {
  machineVersion: 'v3';
}

export const v3NhTownBallotTemplate: BallotPageTemplateV3 = {
  frameComponent: BallotPageFrame,
  contentComponent: BallotPageContent,
  machineVersion: 'v3',
};
