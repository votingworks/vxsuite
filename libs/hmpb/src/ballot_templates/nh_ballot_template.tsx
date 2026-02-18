import React from 'react';
import {
  assert,
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
  AnyContest,
  BallotMode,
  BallotStyle,
  BallotStyleId,
  BallotType,
  BaseBallotProps,
  Candidate,
  CandidateContest as CandidateContestStruct,
  ContestId,
  OrderedCandidateOption,
  Election,
  ElectionId,
  LanguageCode,
  NhPrecinctSplitOptions,
  Precinct,
  PrecinctId,
  YesNoContest,
  ballotPaperDimensions,
  getBallotStyle,
  getPartyForBallotStyle,
  hasSplits,
  getContests,
  getOrderedCandidatesForContestInBallotStyle,
} from '@votingworks/types';
import {
  BackendLanguageContextProvider,
  CandidatePartyList,
  electionStrings,
  RichText,
} from '@votingworks/ui';
import { parse as parseHtml } from 'node-html-parser';
import {
  BallotLayoutError,
  BallotPageTemplate,
  ContentComponentResult,
} from '../render_ballot';
import { RenderScratchpad } from '../renderer';
import {
  OptionInfo,
  Page,
  TimingMarkGrid,
  WRITE_IN_OPTION_CLASS,
  pageMarginsInches,
  BlankPageMessage,
  Box,
  AlignedBubble,
  Colors,
  ContestHeader,
  DualLanguageText,
  Footer,
  Instructions,
  primaryLanguageCode,
  WriteInLabel,
  ContestTitle,
  PrecinctOrSplitName,
  CANDIDATE_OPTION_CLASS,
  BALLOT_MEASURE_OPTION_CLASS,
} from '../ballot_components';
import { PixelDimensions, CandidateOrdering, RotationParams } from '../types';
import { hmpbStrings } from '../hmpb_strings';
import { layOutInColumns } from '../layout_in_columns';
import { Watermark } from './watermark';
import { ArrowRightCircle } from '../svg_assets';
import { BaseStyles } from '../base_styles';

// Maps the number of candidates in a contest to the index at which to rotate
// the candidates. These indexes are randomly selected by the state every 2
// years. Note that these use 1-based indexing.
const NH_ROTATION_INDICES: Record<number, number> = {
  2: 1,
  3: 1,
  4: 4,
  5: 4,
  6: 2,
  7: 6,
  8: 4,
  9: 2,
  10: 3,
  11: 1,
  12: 1,
  13: 10,
  14: 9,
  15: 1,
  16: 15,
  17: 5,
  18: 10,
  19: 10,
  20: 10,
};

/**
 * Rotate a contest's candidates according to the governing statute.
 *
 * The NH rotation algorithm is as follows:
 * 1. Order the candidates alphabetically by last name.
 * 2. Cut the "deck" at a randomly selected index (see NH_ROTATION_INDICES).
 */
export function rotateCandidatesByStatute(
  contest: CandidateContestStruct
): OrderedCandidateOption[] {
  if (contest.candidates.length < 2) {
    return contest.candidates.map((c) => ({ id: c.id, partyIds: c.partyIds }));
  }

  function getSortingName(candidate: Candidate): string {
    return (
      // || instead of ?? because when lastName and firstName are empty string we want to sort by
      // the last word of `name`. This supports backwards compatibility with elections that were
      // created before structured name input.
      candidate.lastName ||
      candidate.firstName ||
      assertDefined(candidate.name.split(' ').at(-1))
    );
  }

  const orderedCandidates = [...contest.candidates].sort((a, b) =>
    getSortingName(a).localeCompare(getSortingName(b))
  );

  const rotationIndex =
    assertDefined(
      NH_ROTATION_INDICES[contest.candidates.length],
      `No rotation index defined for contest with ${contest.candidates.length} candidates`
    ) - 1;

  const rotatedCandidates = [
    ...orderedCandidates.slice(rotationIndex),
    ...orderedCandidates.slice(0, rotationIndex),
  ];
  return rotatedCandidates.map((c) => ({ id: c.id, partyIds: c.partyIds }));
}

export function rotateCandidatesByPrecinct(
  contest: CandidateContestStruct,
  precincts: readonly Precinct[],
  precinctId: PrecinctId
): OrderedCandidateOption[] {
  if (contest.candidates.length < 2) {
    return contest.candidates.map((c) => ({ id: c.id, partyIds: c.partyIds }));
  }
  const allPrecinctsWithContest = precincts.filter((precinct) =>
    hasSplits(precinct)
      ? precinct.splits.some((split) =>
          split.districtIds.includes(contest.districtId)
        )
      : precinct.districtIds.includes(contest.districtId)
  );
  const offset =
    allPrecinctsWithContest.findIndex(
      (precinct) => precinct.id === precinctId
    ) % contest.candidates.length;
  // First, rotate by statute
  const candidatesRotatedByStatute = rotateCandidatesByStatute(contest);
  // Then rotate by precinct offset
  const rotatedCandidates = [
    ...candidatesRotatedByStatute.slice(offset),
    ...candidatesRotatedByStatute.slice(0, offset),
  ];
  return rotatedCandidates;
}

// Special case for some specific contests in the November 2025 election that
// use rotation by precinct (they have a legal exception). Since this is a
// very specific exception, we hardcode it for now. In the future, we can
// revisit whether we want to support this in a more general way.
const contestsUsingPrecinctRotation: Record<ElectionId, ContestId[]> = {
  '5p1op86c38fe': [
    'brxyaolp9hvi',
    '3vqx3zkl5dhi',
    '14nvftrtp8cl',
    'exgu2lnf1g1i',
    'fpkjxj4ow10w',
  ],
};

function rotateCandidates(
  contest: CandidateContestStruct,
  electionId: ElectionId,
  precincts: readonly Precinct[],
  precinctId: PrecinctId
): OrderedCandidateOption[] {
  if ((contestsUsingPrecinctRotation[electionId] ?? []).includes(contest.id)) {
    return rotateCandidatesByPrecinct(contest, precincts, precinctId);
  }
  return rotateCandidatesByStatute(contest);
}

/**
 * Generates ordered contests for NH ballot template.
 * Candidates within a template are rotated by statute across all ballot styles in most cases.
 * There are special cases, handled for now via hardcoding, where certain contests are rotated by precinct.
 */
export function getCandidateOrderingSetsForNhBallot({
  contests,
  precincts,
  electionId,
  precinctsOrSplitIds,
}: RotationParams): CandidateOrdering[] {
  const rotationsByPrecinct = precinctsOrSplitIds.map(
    ({ precinctId, splitId }) => {
      const orderedCandidatesByContest: Record<
        ContestId,
        OrderedCandidateOption[]
      > = {};
      for (const contest of contests) {
        switch (contest.type) {
          case 'candidate':
            orderedCandidatesByContest[contest.id] = rotateCandidates(
              contest,
              electionId,
              precincts,
              precinctId
            );
            break;
          case 'yesno':
          case 'straight-party':
            // do nothing
            break;
          default:
            throwIllegalValue(contest, 'type');
        }
      }
      return {
        precinctsOrSplits: [{ precinctId, splitId }],
        orderedCandidatesByContest,
      };
    }
  );

  // Return a rotation for each precinct/split, deduplicating is handled outside of the template-specific logic.
  return rotationsByPrecinct;
}

function Header({
  election,
  precinctId,
  ballotStyleId,
  ballotType,
  ballotMode,

  electionTitleOverride,
  electionSealOverride,
  clerkSignatureImage: clerkSignatureImageOverride,
  clerkSignatureCaption: clerkSignatureCaptionOverride,
}: {
  election: Election;
  precinctId: PrecinctId;
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

  const showPrecinctName = election.precincts.length > 1;

  // Signature is guaranteed to exist due to validation in BallotPageFrame
  assert(election.signature);
  const clerkSignatureImage =
    clerkSignatureImageOverride ?? election.signature.image;
  // clerkSignatureCaptionOverride will be an empty string if it is
  // entered and then deleted, so treat it as undefined and fallback
  // the election signature
  const clerkSignatureCaption =
    clerkSignatureCaptionOverride || election.signature.caption;

  return (
    <div
      style={{
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
            electionSealOverride ?? election.seal
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
            {showPrecinctName && (
              <PrecinctOrSplitName
                election={election}
                precinctId={precinctId}
                ballotStyleId={ballotStyleId}
              />
            )}
          </div>
        </DualLanguageText>
      </div>
      <div style={{ flexGrow: 1 }}>
        <div
          style={{
            height: '3rem',
            backgroundImage: `url(data:image/svg+xml;base64,${Buffer.from(
              clerkSignatureImage
            ).toString('base64')})`,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            marginTop: '0.125rem',
            visibility: ballotMode === 'sample' ? 'hidden' : 'visible',
          }}
        />
        <div
          style={{
            visibility: ballotMode === 'sample' ? 'hidden' : 'visible',
          }}
        >
          {clerkSignatureCaption}
        </div>
      </div>
    </div>
  );
}

// Almost identical to vx_default_ballot_template BallotPageFrame except additional props are passed to Header.
function BallotPageFrame({
  election,
  ballotStyleId,
  compact,
  precinctId,
  ballotType,
  ballotMode,
  pageNumber,
  totalPages,
  children,
  electionTitleOverride,
  electionSealOverride,
  clerkSignatureImage: clerkSignatureImageOverride,
  clerkSignatureCaption: clerkSignatureCaptionOverride,
  watermark,
}: NhBallotProps & {
  pageNumber: number;
  totalPages?: number;
  children: JSX.Element;
}): Result<JSX.Element, BallotLayoutError> {
  // Validate signature is present before rendering as old elections or
  // elections toggled from the VxDefault template may be missing it
  if (!election.signature) {
    return err({
      error: 'missingSignature',
    });
  }

  const pageDimensions = ballotPaperDimensions(election.ballotLayout.paperSize);
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  const languageCode = primaryLanguageCode(ballotStyle);
  // There are a number of places in the design and implementation of this
  // template that haven't yet been extended to support translations and
  // dual-language ballots (e.g. the header layout, the logic to split long
  // ballot measures across pages).
  assert(
    (!ballotStyle.languages || ballotStyle.languages.length === 1) &&
      languageCode === LanguageCode.ENGLISH,
    'NH ballot template only supports English'
  );
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
        <TimingMarkGrid pageDimensions={pageDimensions}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: compact ? '0.5rem' : '0.75rem',
              padding: '0.125in',
            }}
          >
            {pageNumber === 1 && (
              <>
                <Header
                  election={election}
                  precinctId={precinctId}
                  ballotStyleId={ballotStyleId}
                  ballotType={ballotType}
                  ballotMode={ballotMode}
                  electionTitleOverride={electionTitleOverride}
                  electionSealOverride={electionSealOverride}
                  clerkSignatureImage={clerkSignatureImageOverride}
                  clerkSignatureCaption={clerkSignatureCaptionOverride}
                />
                <Instructions languageCode={languageCode} bubbleSide="right" />
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
              electionTitleOverride={electionTitleOverride}
            />
          </div>
        </TimingMarkGrid>
      </Page>
    </BackendLanguageContextProvider>
  );
}

function CandidateContest({
  election,
  contest,
  compact,
  ballotStyle,
}: {
  election: Election;
  contest: CandidateContestStruct;
  compact?: boolean;
  ballotStyle: BallotStyle;
}) {
  const candidates = getOrderedCandidatesForContestInBallotStyle({
    contest,
    ballotStyle,
  });
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
      <ContestHeader>
        <DualLanguageText delimiter="/">
          <ContestTitle>{electionStrings.contestTitle(contest)}</ContestTitle>
        </DualLanguageText>
        <DualLanguageText delimiter="/">
          <div>
            {voteForText}
            {willBeElectedText && <>; {willBeElectedText}</>}
          </div>
        </DualLanguageText>
        {contest.termDescription && (
          <DualLanguageText delimiter="/">
            <div>{electionStrings.contestTerm(contest)}</div>
          </DualLanguageText>
        )}
      </ContestHeader>
      <ul>
        {candidates.map((candidate, i) => {
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
            partyIds: candidate.partyIds,
          };
          return (
            <li
              key={candidate.id}
              className={CANDIDATE_OPTION_CLASS}
              style={{
                padding: '0.375rem 0.5rem',
                borderTop:
                  i !== 0 ? `1px solid ${Colors.DARK_GRAY}` : undefined,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                }}
              >
                <div style={{ flex: 1, textAlign: 'right' }}>
                  <strong>{candidate.name}</strong>
                  {partyText && (
                    <DualLanguageText delimiter="/">
                      <div>{partyText}</div>
                    </DualLanguageText>
                  )}
                </div>
                <AlignedBubble compact={compact} optionInfo={optionInfo} />
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
                top: compact ? 0.7 : 0.8,
                right: -0.9,
                bottom: 0.2,
                left: 8.7,
              },
            };
            return (
              <li
                key={writeInIndex}
                className={WRITE_IN_OPTION_CLASS}
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  padding: '0.25rem 0.5rem',
                  paddingTop: '0.9rem',
                  borderTop: `1px solid ${Colors.DARK_GRAY}`,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      borderBottom: `1px solid ${Colors.BLACK}`,
                      height: '1.25rem',
                    }}
                  />
                  <div style={{ fontSize: '0.8rem' }}>
                    <WriteInLabel />
                  </div>
                </div>
                <AlignedBubble compact={compact} optionInfo={optionInfo} />
              </li>
            );
          })}
      </ul>
    </Box>
  );
}

function BallotMeasureContest({
  contest,
  compact,
  continuesOnNextPage,
}: {
  contest: YesNoContest;
  compact?: boolean;
  continuesOnNextPage?: boolean;
}) {
  return (
    <Box style={{ padding: 0 }}>
      <ContestHeader>
        <DualLanguageText delimiter="/">
          <ContestTitle>{contest.title}</ContestTitle>
        </DualLanguageText>
      </ContestHeader>
      <div
        style={{
          display: 'flex',
          flexDirection: compact && !continuesOnNextPage ? 'row' : 'column',
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
          <DualLanguageText>
            <RichText
              tableBorderWidth={'1px'}
              tableBorderColor={Colors.DARKER_GRAY}
              tableHeaderBackgroundColor={Colors.LIGHT_GRAY}
            >
              {/* The logic to split long ballot measures across pages
              manipulates `contest.description`, but doesn't change
              `Election.ballotStrings`, so we can't use the usual
              `electionStrings.contestDescription(contest)` here, since that
              relies on `ballotStrings`. Since we currently only support English
              ballots, that's ok. However, if we ever support multiple
              languages, we'll need to revisit this. */}
              <div
                className="contestDescription"
                dangerouslySetInnerHTML={{ __html: contest.description }}
              />
            </RichText>
          </DualLanguageText>
        </div>
        {continuesOnNextPage ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '0.375rem 0.5rem',
              borderTop: `1px solid ${Colors.LIGHT_GRAY}`,
              backgroundColor: Colors.LIGHT_GRAY,
            }}
          >
            <h4
              style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
            >
              Continues on next page{' '}
              <ArrowRightCircle style={{ height: '1rem' }} />
            </h4>
          </div>
        ) : (
          <ul
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'end',
            }}
          >
            {[
              contest.yesOption,
              contest.noOption,
              ...(contest.additionalOptions ?? []),
            ].map((option) => (
              <li
                key={option.id}
                className={BALLOT_MEASURE_OPTION_CLASS}
                style={{
                  padding: '0.375rem 0.5rem',
                  borderTop: `1px solid ${Colors.LIGHT_GRAY}`,
                  borderLeft: compact
                    ? `1px solid ${Colors.LIGHT_GRAY}`
                    : undefined,
                }}
              >
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <strong style={{ flex: 1, textAlign: 'right' }}>
                    <DualLanguageText delimiter="/">
                      {electionStrings.contestOptionLabel(option)}
                    </DualLanguageText>
                  </strong>
                  <AlignedBubble
                    compact={compact}
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
        )}
      </div>
    </Box>
  );
}

function Contest({
  compact,
  contest,
  election,
  ballotStyle,
}: {
  compact?: boolean;
  contest: AnyContest;
  election: Election;
  ballotStyle: BallotStyle;
  precinctId: PrecinctId;
}) {
  switch (contest.type) {
    case 'candidate':
      return (
        <CandidateContest
          compact={compact}
          election={election}
          contest={contest}
          ballotStyle={ballotStyle}
        />
      );
    case 'yesno':
      return <BallotMeasureContest compact={compact} contest={contest} />;
    case 'straight-party':
      // TODO: Render straight-party contest (Commit 10)
      return null;
    default:
      return throwIllegalValue(contest);
  }
}

async function splitLongBallotMeasureAcrossPages(
  tooLongContest: YesNoContest,
  contestProps: Omit<Parameters<typeof Contest>[0], 'contest'>,
  ballotStyle: BallotStyle,
  dimensions: PixelDimensions,
  scratchpad: RenderScratchpad
): Promise<
  Result<
    { firstContestElement: JSX.Element; restContest: YesNoContest },
    BallotLayoutError
  >
> {
  const columnWidthPx = dimensions.width;
  const contestElement = (
    <BackendLanguageContextProvider
      currentLanguageCode={primaryLanguageCode(ballotStyle)}
      uiStringsPackage={contestProps.election.ballotStrings}
    >
      <div className="contestWrapper" style={{ width: `${columnWidthPx}px` }}>
        <Contest {...contestProps} contest={tooLongContest} />
      </div>
    </BackendLanguageContextProvider>
  );
  const [contestMeasurements] = await scratchpad.measureElements(
    contestElement,
    '.contestWrapper'
  );
  const childMeasurements = await scratchpad.measureElements(
    contestElement,
    '.contestDescription > *'
  );
  const continuesFooterHeight = 30; // "Continues on next page" caption
  let firstOverflowingChildIndex = childMeasurements.findIndex(
    (child) =>
      child.y - contestMeasurements.y + child.height + continuesFooterHeight >=
      dimensions.height
  );

  // If no child explicitly overflows with the continues footer, it means the
  // contest overflows due to the Yes/No options (which are larger than the
  // continues footer). In this case, we split before the last child to be safe.
  // This function is only called when the contest is known to be too long.
  if (firstOverflowingChildIndex === -1) {
    firstOverflowingChildIndex = childMeasurements.length - 1;
  }

  // If a given child, e.g., paragraph, is itself too tall to fit on the page, we can't proceed and
  // need the user to try a longer paper size or higher density, or add a line break to their
  // content.
  if (firstOverflowingChildIndex === 0) {
    return err({
      error: 'contestTooLong',
      contest: tooLongContest,
    });
  }

  const descriptionHtmlNode = parseHtml(tooLongContest.description);
  const descriptionHtmlText = descriptionHtmlNode.toString();
  for (const overflowingChild of descriptionHtmlNode.childNodes.slice(
    firstOverflowingChildIndex
  )) {
    descriptionHtmlNode.removeChild(overflowingChild);
  }
  const splitIndex = descriptionHtmlNode.toString().length;

  const firstDescriptionChunk = descriptionHtmlText.slice(0, splitIndex);
  const firstContest: YesNoContest = {
    ...tooLongContest,
    description: firstDescriptionChunk,
  };
  const firstContestElement = (
    <BallotMeasureContest
      {...contestProps}
      contest={firstContest}
      continuesOnNextPage
    />
  );

  const restDescription = descriptionHtmlText.slice(splitIndex);
  const continuedTitleSuffix = ' (Continued)';
  const continuedTitle = tooLongContest.title.endsWith(continuedTitleSuffix)
    ? tooLongContest.title
    : `${tooLongContest.title}${continuedTitleSuffix}`;
  const restContest: YesNoContest = {
    ...tooLongContest,
    title: continuedTitle,
    description: restDescription,
  };

  return ok({
    firstContestElement,
    restContest,
  });
}

async function BallotPageContent(
  props: (NhBallotProps & { dimensions: PixelDimensions }) | undefined,
  scratchpad: RenderScratchpad
): Promise<ContentComponentResult<NhBallotProps>> {
  if (!props) {
    return ok({
      currentPageElement: <BlankPageMessage />,
      nextPageProps: undefined,
    });
  }

  const { compact, election, ballotStyleId, dimensions, ...restProps } = props;
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

  // Add as many contests on this page as will fit.
  const pageSections: JSX.Element[] = [];
  let heightUsed = 0;

  // TODO is there some way we can use rem here instead of having to know the
  // font size and map to px?
  const horizontalGapPx = (compact ? 0.5 : 0.75) * 16; // Assuming 16px per 1rem
  const verticalGapPx = horizontalGapPx;
  while (contestSections.length > 0 && heightUsed < dimensions.height) {
    const section = assertDefined(contestSections.shift());
    const contestElements = section.map((contest) => (
      <Contest
        key={contest.id}
        compact={compact}
        contest={contest}
        election={election}
        precinctId={props.precinctId}
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
      .map(([element, measurements]) => ({ element, ...measurements }))
      .async();

    const { columns, height } = await layOutInColumns({
      elements: measuredContests,
      numColumns,
      maxColumnHeight: dimensions.height - heightUsed,
      elementGap: verticalGapPx,
    });

    // Put contests we didn't lay out back on the front of the queue
    const numElementsUsed = columns.flat().length;
    if (numElementsUsed < section.length) {
      contestSections.unshift(section.slice(numElementsUsed));
    }

    // If there wasn't enough room left for any contests, go to the next page
    if (height === 0) {
      break;
    }

    // Add vertical gap to account for space between sections
    heightUsed += height + verticalGapPx;
    pageSections.push(
      <div style={{ display: 'flex', gap: `${horizontalGapPx}px` }}>
        {columns.map((column, i) => (
          <div
            key={`column-${i}`}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: `${verticalGapPx}px`,
            }}
          >
            {column.map(({ element }) => element)}
          </div>
        ))}
      </div>
    );
  }

  const contestsLeftToLayout = contestSections.flat();
  if (contests.length > 0 && contestsLeftToLayout.length === contests.length) {
    const tooLongContest = assertDefined(contestsLeftToLayout.shift());
    if (tooLongContest.type === 'yesno') {
      const splitResult = await splitLongBallotMeasureAcrossPages(
        tooLongContest,
        {
          election,
          compact,
          precinctId: props.precinctId,
          ballotStyle,
        },
        ballotStyle,
        {
          width: dimensions.width,
          height: dimensions.height,
        },
        scratchpad
      );
      if (splitResult.isErr()) {
        return splitResult;
      }
      const { firstContestElement, restContest } = splitResult.ok();
      pageSections.push(firstContestElement);
      contestsLeftToLayout.unshift(restContest);
    } else {
      return err({
        error: 'contestTooLong',
        contest: tooLongContest,
      });
    }
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
        {pageSections.map((sectionContests, i) => (
          <div
            key={`section-${i}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: `${verticalGapPx}px`,
            }}
          >
            {sectionContests}
          </div>
        ))}
      </div>
    ) : (
      <BlankPageMessage />
    );
  const nextPageProps =
    contestsLeftToLayout.length > 0
      ? {
          ...restProps,
          compact,
          ballotStyleId,
          election: {
            ...election,
            contests: contestsLeftToLayout,
          },
        }
      : undefined;

  return ok({
    currentPageElement,
    nextPageProps,
  });
}

export type NhBallotProps = BaseBallotProps & NhPrecinctSplitOptions;

export const nhBallotTemplate: BallotPageTemplate<NhBallotProps> = {
  stylesComponent: BaseStyles,
  frameComponent: BallotPageFrame,
  contentComponent: BallotPageContent,
};
