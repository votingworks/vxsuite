import {
  assertDefined,
  err,
  iter,
  ok,
  range,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import {
  Contest as ContestStruct,
  BallotMode,
  BallotType,
  BallotStyle,
  CandidateContest as CandidateContestStruct,
  Election,
  Party,
  YesNoContest,
  ballotPaperDimensions,
  getBallotStyle,
  getContests,
  getOrderedCandidatesForContestInBallotStyle,
  getPartyForBallotStyle,
  getPrecinctById,
  straightPartyNotYetImplemented,
} from '@votingworks/types';
import {
  BackendLanguageContextProvider,
  electionStrings,
  RichText,
} from '@votingworks/ui';
import React from 'react';
import styled from 'styled-components';
import { BallotLayoutError, ContentComponentResult } from '../render_ballot';
import { RenderScratchpad } from '../renderer';
import { SpotColor } from '../pdf_conversion';
import {
  OptionInfo,
  Page,
  TimingMarkGrid,
  BALLOT_MEASURE_OPTION_CLASS,
  CANDIDATE_OPTION_CLASS,
  WRITE_IN_OPTION_CLASS,
  pageMarginsInches,
  AlignedBubble,
  Colors,
  primaryLanguageCode,
  WriteInLabel,
} from '../ballot_components';
import { PixelDimensions } from '../types';
import { hmpbStrings } from '../hmpb_strings';
import { layOutInColumns } from '../layout_in_columns';
import { Watermark } from './watermark';
import {
  allCaps,
  HandCountInsignia,
  Instructions,
  isFederalOfficeContest,
  Footer,
  NhStateBallotProps,
  isDemocraticParty,
  isRepublicanParty,
} from './nh_state_ballot_components';

export const ColorTints = {
  BLUE: '#8FD0F1',
  RED: '#F4C3CC',
  GRAY: Colors.LIGHT_GRAY,
} as const;

/**
 * The spot (Pantone) inks the NH printer prints the party tints with. Each
 * partisan ballot is a two-ink job: the party's spot plate plus a single black
 * plate.
 *
 * The `grayscaleTint` values are verified against Ghostscript's actual
 * conversion in pdf_conversion.test.ts.
 */
export const NhStateSpotColors: Record<'BLUE' | 'RED', SpotColor> = {
  BLUE: {
    name: 'PMS 293',
    sourceColor: ColorTints.BLUE,
    grayscaleTint: '0.776',
  },
  RED: {
    name: 'PMS 699',
    sourceColor: ColorTints.RED,
    grayscaleTint: '0.812',
  },
};

export type ColorTint = keyof typeof ColorTints;

const Box = styled.div<{
  fill?: 'transparent' | 'tinted' | ColorTint;
}>`
  border: 1px solid ${Colors.BLACK};
  border-width: 0 0 3px 0;
  padding: 0.75rem;
  background-color: ${(p) =>
    p.fill === 'tinted'
      ? Colors.LIGHT_GRAY
      : p.fill === 'transparent' || !p.fill
      ? 'none'
      : ColorTints[p.fill]};
`;

function colorTintForParty(party: Party): ColorTint {
  if (isDemocraticParty(party)) return 'BLUE';
  if (isRepublicanParty(party)) return 'RED';
  return 'GRAY';
}

function Header({
  election,
  ballotType,
  ballotMode,
  party,
  wardName,
  isFederalOfficeOnly,
}: {
  election: Election;
  ballotType: BallotType;
  ballotMode: BallotMode;
  party: Party;
  wardName?: string;
  isFederalOfficeOnly?: boolean;
}): JSX.Element {
  const isAbsentee = ballotType === 'absentee';
  const ballotTitle = {
    official: 'OFFICIAL BALLOT',
    test: 'TEST BALLOT',
    sample: 'SAMPLE BALLOT',
  }[ballotMode];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        alignItems: 'center',
      }}
    >
      <div style={{ fontWeight: 'bold' }}>
        <div
          style={{
            fontWeight: 'bold',
            fontSize: '9pt',
            textAlign: 'center',
          }}
        >
          INSTRUCTIONS TO VOTERS
        </div>
        <Instructions />
      </div>
      <div
        style={{
          ...allCaps,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignSelf: 'stretch',
          padding: '0 0.5rem',
        }}
      >
        <h3 style={{ visibility: isFederalOfficeOnly ? 'visible' : 'hidden' }}>
          FEDERAL OFFICE ONLY
        </h3>
        <h3 style={{ visibility: isAbsentee ? 'visible' : 'hidden' }}>
          ABSENTEE
        </h3>
        <h5
          style={{
            visibility: ballotMode === 'sample' ? 'hidden' : 'visible',
            lineHeight: 1,
          }}
        >
          {ballotTitle} For
        </h5>
        <div style={{ lineHeight: '1.3' }}>
          <h1 style={{ lineHeight: 1 }}>
            {electionStrings.jurisdictionName(election.jurisdiction)}
            {wardName ? ` ${wardName}` : ''}
          </h1>
          {<h1>{electionStrings.partyName(party)}</h1>}
        </div>
        <h5 style={{ lineHeight: 1 }}>
          {isFederalOfficeOnly ? 'Federal' : 'State'} Primary Election
        </h5>
        <h5>{electionStrings.electionDate(election)}</h5>
      </div>
      {ballotMode === 'sample' ? (
        <div
          style={{
            width: '1.5in',
            height: '1.346in',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            justifySelf: 'center',
          }}
        >
          <div
            style={{
              fontSize: '40pt',
              fontWeight: 'bold',
              lineHeight: 1,
            }}
          >
            SAMPLE
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              height: '0.946in',
              aspectRatio: '1 / 1',
              backgroundImage: `url(data:image/svg+xml;base64,${Buffer.from(
                election.seal
              ).toString('base64')})`,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
            }}
          />
          <div
            style={{
              height: '0.4in',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ textAlign: 'right' }}>
              <img
                src={`data:image/svg+xml;base64,${Buffer.from(
                  assertDefined(election.signature).image
                ).toString('base64')}`}
                style={{
                  width: '1.5in',
                }}
              />
              <div
                style={{
                  ...allCaps,
                  fontSize: '6.25pt',
                  fontWeight: 'bold',
                  marginTop: '-1rem',
                  marginRight: '0.25rem',
                }}
              >
                {assertDefined(election.signature).caption}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function BallotPageFrame({
  election,
  ballotStyleId,
  precinctId,
  ballotType,
  ballotMode,
  pageNumber,
  totalPages,
  children,
  watermark,
  isHandCount,
  isFederalOfficeOnly,
  isUocava,
}: NhStateBallotProps & {
  pageNumber: number;
  totalPages?: number;
  children: JSX.Element;
}): Result<JSX.Element, BallotLayoutError> {
  if (!election.signature) {
    return err({ error: 'missingSignature' });
  }

  const pageDimensions = ballotPaperDimensions(election.ballotLayout.paperSize);
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  const party = assertDefined(
    getPartyForBallotStyle({ election, ballotStyleId })
  );
  const colorTint = colorTintForParty(party);
  // For warded jurisdictions, the precinct is a ward whose name differs from
  // the jurisdiction; show it in the header. Unwarded towns use the town name
  // as the precinct name, so there's nothing extra to show.
  const precinct = getPrecinctById({ election, precinctId });
  const wardName =
    precinct && precinct.name !== election.jurisdiction.name
      ? precinct.name
      : undefined;
  return ok(
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
        {watermark && <Watermark>{watermark}</Watermark>}
        <TimingMarkGrid
          pageDimensions={pageDimensions}
          hideTimingMarks={
            ballotMode === 'sample' ||
            isHandCount ||
            isFederalOfficeOnly ||
            isUocava
          }
        >
          <div
            style={{
              fontFamily: 'Helvetica Condensed',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              padding: '0.125in',
            }}
          >
            {pageNumber === 1 && (
              <div
                style={{
                  backgroundColor: ColorTints[colorTint],
                  padding: '0.5rem',
                  borderBottom: '5px solid black',
                }}
              >
                <Header
                  election={election}
                  ballotType={ballotType}
                  ballotMode={ballotMode}
                  party={party}
                  wardName={wardName}
                  isFederalOfficeOnly={isFederalOfficeOnly}
                />
              </div>
            )}
            <div
              style={{
                flex: 1,
                // Prevent this flex item from overflowing its container
                // https://stackoverflow.com/a/66689926
                minHeight: 0,
                position: 'relative',
              }}
            >
              {children}
              {isHandCount && !isFederalOfficeOnly && (
                <HandCountInsignia
                  pageNumber={pageNumber}
                  totalPages={totalPages}
                  election={election}
                  ballotType={ballotType}
                  ballotMode={ballotMode}
                  party={party}
                  backgroundColor={ColorTints[colorTint]}
                />
              )}
            </div>
            <Footer
              pageNumber={pageNumber}
              totalPages={totalPages}
              ballotMode={ballotMode}
              isHandCount={isHandCount}
              isFederalOfficeOnly={isFederalOfficeOnly}
              isUocava={isUocava}
            />
          </div>
        </TimingMarkGrid>
      </Page>
    </BackendLanguageContextProvider>
  );
}

const ContestHeader = styled.div<{ colorTint: ColorTint }>`
  background: ${(p) => ColorTints[p.colorTint]};
  padding: 0.25rem 0.125rem 0 0.125rem;
  text-align: center;
  border-bottom: 1px solid ${Colors.BLACK};
`;

const ContestTitle = styled.h2`
  line-height: 1;
`;

function CandidateContest({
  contest,
  colorTint,
  ballotStyle,
}: {
  contest: CandidateContestStruct;
  colorTint: ColorTint;
  ballotStyle: BallotStyle;
}) {
  const voteForText = {
    1: hmpbStrings.hmpbVoteForNotMoreThan1,
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

  const willBeElectedText = {
    2: hmpbStrings.hmpb2WillBeElected,
    3: hmpbStrings.hmpb3WillBeElected,
    4: hmpbStrings.hmpb4WillBeElected,
    5: hmpbStrings.hmpb5WillBeElected,
    6: hmpbStrings.hmpb6WillBeElected,
    7: hmpbStrings.hmpb7WillBeElected,
    8: hmpbStrings.hmpb8WillBeElected,
    9: hmpbStrings.hmpb9WillBeElected,
    10: hmpbStrings.hmpb10WillBeElected,
  }[contest.seats];

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
      }}
    >
      <ContestHeader colorTint={colorTint}>
        <ContestTitle>{electionStrings.contestTitle(contest)}</ContestTitle>
        <h5>
          {voteForText}
          {willBeElectedText && <span>; {willBeElectedText}</span>}
        </h5>
        {contest.termDescription && (
          <div>{electionStrings.contestTerm(contest)}</div>
        )}
      </ContestHeader>
      <ul
        style={{
          marginBottom: '0.125rem',
          borderBottom: '1px solid black',
        }}
      >
        {getOrderedCandidatesForContestInBallotStyle({
          contest,
          ballotStyle,
        }).map((candidate, i) => {
          const optionInfo: OptionInfo = {
            type: 'option',
            contestId: contest.id,
            optionId: candidate.id,
          };
          return (
            <li key={candidate.id} className={CANDIDATE_OPTION_CLASS}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  paddingRight: '1rem',
                  borderTop: i !== 0 ? `1px solid ${Colors.BLACK}` : undefined,
                }}
              >
                <div
                  style={{
                    flex: 1,
                    padding: '0.125rem 0 ',
                  }}
                >
                  <h4>{candidate.name}</h4>
                </div>
                <AlignedBubble optionInfo={optionInfo} />
              </div>
            </li>
          );
        })}
        {contest.allowWriteIns &&
          range(0, contest.seats).map((writeInIndex) => {
            const optionInfo: OptionInfo = {
              type: 'write-in',
              contestId: contest.id,
              writeInIndex,
              writeInArea: {
                top: 0.35,
                right: -0.5,
                bottom: 0.35,
                left: 7.7,
              },
            };
            return (
              <li
                key={writeInIndex}
                className={WRITE_IN_OPTION_CLASS}
                style={{
                  display: 'flex',
                  textAlign: 'right',
                  alignItems: 'center',
                  paddingRight: '1rem',
                  borderTop: `1px solid ${Colors.BLACK}`,
                }}
              >
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'end',
                    padding: '0.875rem 0 0.125rem 0',
                  }}
                >
                  <div
                    style={{
                      textTransform: 'uppercase',
                      fontSize: '6pt',
                      paddingRight: '0.25rem',
                    }}
                  >
                    <WriteInLabel />
                  </div>
                </div>
                <AlignedBubble optionInfo={optionInfo} />
              </li>
            );
          })}
      </ul>
    </Box>
  );
}

function BallotMeasureContest({
  contest,
  colorTint,
}: {
  contest: YesNoContest;
  colorTint: ColorTint;
}) {
  return (
    <Box style={{ padding: 0 }}>
      <ContestHeader colorTint={colorTint} style={{ paddingBottom: '0.25rem' }}>
        <ContestTitle>{electionStrings.contestTitle(contest)}</ContestTitle>
      </ContestHeader>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '0.25rem',
        }}
      >
        <div
          style={{
            padding: '0.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <RichText
            tableBorderWidth={'1px'}
            tableBorderColor={Colors.DARKER_GRAY}
            tableHeaderBackgroundColor={Colors.LIGHT_GRAY}
          >
            {electionStrings.contestDescription(contest)}
          </RichText>
        </div>
        <ul
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'end',
          }}
        >
          {contest.options.map((option) => (
            <li
              key={option.id}
              className={BALLOT_MEASURE_OPTION_CLASS}
              style={{
                padding: '0.375rem 0.5rem',
                borderTop: `1px solid ${Colors.BLACK}`,
              }}
            >
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <strong style={{ flex: 1, textAlign: 'right' }}>
                  {electionStrings.contestOptionLabel(option)}
                </strong>
                <AlignedBubble
                  optionInfo={{
                    type: 'option',
                    contestId: contest.id,
                    optionId: option.id,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Box>
  );
}

function Contest({
  contest,
  colorTint,
  ballotStyle,
}: {
  contest: ContestStruct;
  election: Election;
  colorTint: ColorTint;
  ballotStyle: BallotStyle;
}) {
  /* istanbul ignore next */
  if (contest.type === 'straight-party') {
    return straightPartyNotYetImplemented();
  }
  switch (contest.type) {
    case 'candidate':
      return (
        <CandidateContest
          contest={contest}
          colorTint={colorTint}
          ballotStyle={ballotStyle}
        />
      );
    case 'yesno':
      return <BallotMeasureContest contest={contest} colorTint={colorTint} />;
    default:
      return throwIllegalValue(contest);
  }
}

export async function BallotPageContent(
  props: NhStateBallotProps & { dimensions: PixelDimensions },
  scratchpad: RenderScratchpad
): Promise<ContentComponentResult<NhStateBallotProps>> {
  const { election, ballotStyleId, dimensions, ...restProps } = props;
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  const party = assertDefined(
    getPartyForBallotStyle({ election, ballotStyleId })
  );
  const colorTint = colorTintForParty(party);
  const contests = getContests({ election, ballotStyle });
  if (contests.length === 0) {
    throw new Error('No contests assigned to this precinct.');
  }
  // One section for candidate contests, one for ballot measures
  const contestSections = iter(contests)
    .filter((contest) =>
      restProps.isFederalOfficeOnly ? isFederalOfficeContest(contest) : true
    )
    .partition((contest) => contest.type === 'candidate')
    .filter((section) => section.length > 0);

  // Add as many contests on this page as will fit.
  const pageSections: JSX.Element[] = [];
  const sectionGapPx = 5;
  let heightUsed = 0;

  const horizontalGapPx = 5;
  while (contestSections.length > 0 && heightUsed < dimensions.height) {
    const section = assertDefined(contestSections.shift());
    const contestElements = section.map((contest) => (
      <Contest
        key={contest.id}
        contest={contest}
        election={election}
        colorTint={colorTint}
        ballotStyle={ballotStyle}
      />
    ));
    const numColumns = section[0].type === 'candidate' ? 3 : 1;
    const columnWidthPx =
      (dimensions.width - horizontalGapPx * (numColumns - 1)) / numColumns;
    const contestMeasurements = await scratchpad.measureElements(
      <BackendLanguageContextProvider
        currentLanguageCode={primaryLanguageCode(ballotStyle)}
        uiStringsPackage={election.ballotStrings}
      >
        {contestElements.map((contest, i) => (
          <div
            className="contestWrapper"
            key={i}
            style={{
              fontFamily: 'Helvetica Condensed',
              width: `${columnWidthPx}px`,
            }}
          >
            {contest}
          </div>
        ))}
      </BackendLanguageContextProvider>,
      '.contestWrapper'
    );
    const measuredContests = iter(contestElements)
      .zip(contestMeasurements)
      .map(([element, measurements]) => ({ element, ...measurements }))
      .toArray();

    const { columns, height, leftoverElements } = layOutInColumns({
      elements: measuredContests,
      numColumns,
      maxColumnHeight: dimensions.height - heightUsed,
    });

    // Put contests we didn't lay out back on the front of the queue
    if (leftoverElements.length > 0) {
      contestSections.unshift(section.slice(-leftoverElements.length));
    }

    // If there wasn't enough room left for any contests, go to the next page
    if (height === 0) {
      break;
    }

    heightUsed += height + sectionGapPx;
    pageSections.push(
      <div
        key={`section-${pageSections.length + 1}`}
        style={{ display: 'flex' }}
      >
        {columns.map((column, i) => (
          <div
            key={`column-${i}`}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              paddingRight:
                i !== columns.length - 1 ? `${horizontalGapPx / 2}px` : 0,
              paddingLeft: i !== 0 ? `${horizontalGapPx / 2}px` : 0,
              borderLeft: i !== 0 ? `1px solid ${Colors.BLACK}` : 0,
            }}
          >
            {column.map(({ element }) => element)}
          </div>
        ))}
      </div>
    );
  }

  const contestsLeftToLayout = contestSections.flat();
  if (heightUsed === 0) {
    return err({
      error: 'contestTooLong',
      contest: contestsLeftToLayout[0],
    });
  }

  const currentPageElement =
    pageSections.length > 0 ? (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: `${sectionGapPx}px`,
        }}
      >
        {pageSections}
      </div>
    ) : (
      <React.Fragment />
    );
  const nextPageProps =
    contestSections.length > 0
      ? {
          ...restProps,
          ballotStyleId,
          election: {
            ...election,
            contests: contestSections.flat(),
          },
        }
      : undefined;

  return ok({
    currentPageElement,
    nextPageProps,
  });
}
