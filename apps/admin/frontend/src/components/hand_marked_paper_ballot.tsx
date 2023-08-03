import { assert, integers, throwIllegalValue } from '@votingworks/basics';
import React, { useLayoutEffect, useRef } from 'react';
import ReactDom from 'react-dom';
import styled from 'styled-components';
import DomPurify from 'dompurify';
import moment from 'moment';
import 'moment/min/locales';
import { Handler, Previewer, registerHandlers } from 'pagedjs';
import type { BallotMode } from '@votingworks/admin-backend';
import {
  BallotType,
  Candidate,
  CandidateContest,
  CandidateVote,
  Election,
  HmpbBallotPageMetadata,
  Vote,
  VotesDict,
  getBallotStyle,
  getContests,
  getPartyFullNameFromBallotStyle,
  getPrecinctById,
  ContestOption,
  BallotStyleId,
  PrecinctId,
  BallotId,
  BallotTargetMarkPosition,
  getCandidatePartiesDescription,
  BallotStyle,
  getContestDistrictName,
} from '@votingworks/types';
import { QrCode, HandMarkedPaperBallotProse, Text } from '@votingworks/ui';
import { format } from '@votingworks/utils';

import { BubbleMark } from './bubble_mark';
import { WriteInLine } from './write_in_line';
import { ABSENTEE_TINT_COLOR } from '../config/globals';
import { getBallotLayoutPageSize } from '../utils/get_ballot_layout_page_size';
import { getBallotLayoutDensity } from '../utils/get_ballot_layout_density';
import { isSuperBallotStyle } from '../utils/election';

function hasVote(
  vote: Vote | undefined,
  optionId: ContestOption['id']
): boolean {
  return (
    vote?.some((choice: Candidate | string) =>
      typeof choice === 'string' ? choice === optionId : choice.id === optionId
    ) ?? false
  );
}

function hasWriteInAtPosition(
  vote: CandidateVote | undefined,
  position: number
): boolean {
  return (
    vote?.some((candidate) => candidate.writeInIndex === position) ?? false
  );
}

function getWriteInNameAtPosition(
  vote: CandidateVote | undefined,
  position: number
): string | undefined {
  const writeIn = vote?.find(
    (candidate) => candidate.writeInIndex === position
  );
  return writeIn?.name;
}

function localeDateLong(dateString: string) {
  return moment(new Date(dateString)).locale('en-US').format('LL');
}

function ballotModeToBallotTitle(ballotMode: BallotMode): string {
  switch (ballotMode) {
    case 'draft': {
      return 'DRAFT BALLOT';
    }
    case 'official': {
      return 'Official Ballot';
    }
    case 'sample': {
      return 'SAMPLE BALLOT';
    }
    case 'test': {
      return 'TEST BALLOT';
    }
    /* istanbul ignore next: Compile-time check for completeness */
    default: {
      throwIllegalValue(ballotMode);
    }
  }
}

const qrCodeTargetClassName = 'qr-code-target';

const BlankPageContent = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
`;

type HmpbBallotMetadata = Omit<HmpbBallotPageMetadata, 'pageNumber'>;

interface PagedJsPage {
  element: HTMLElement;
  id: string;
  pagesArea: HTMLElement;
}
class PostRenderBallotProcessor extends Handler {
  afterRendered(pages: PagedJsPage[]) {
    // Insert blank page if ballot page count is odd.
    if (pages.length % 2) {
      const pagedjsPages = pages[0].pagesArea;
      if (pagedjsPages.lastChild) {
        const newLastPageElement = pagedjsPages.lastChild.cloneNode(
          true
        ) as HTMLElement;
        pagedjsPages.appendChild(newLastPageElement);
        pagedjsPages.setAttribute(
          'style',
          `--pagedjs-page-count:${pages.length + 1};`
        );
        newLastPageElement.id = `page-${pages.length + 1}`;
        newLastPageElement.classList.remove(
          'pagedjs_first_page',
          'pagedjs_right_page'
        );
        newLastPageElement.classList.add('pagedjs_left_page');
        newLastPageElement.setAttribute(
          'data-page-number',
          `${pages.length + 1}`
        );
        newLastPageElement.setAttribute('data-id', `page-${pages.length + 1}`);
        ReactDom.render(
          <BlankPageContent>
            <HandMarkedPaperBallotProse>
              <p>This ballot page is intentionally blank.</p>
            </HandMarkedPaperBallotProse>
          </BlankPageContent>,
          newLastPageElement.getElementsByClassName('pagedjs_page_content')[0]
        );

        const newPage: PagedJsPage = {
          ...pages[pages.length - 1],
          element: newLastPageElement,
        };

        pages.push(newPage);
      }
    }

    // Post-process QR codes in footer.
    for (const page of pages) {
      const qrCodeTarget = page.element.getElementsByClassName(
        qrCodeTargetClassName
      )[0];
      if (qrCodeTarget && qrCodeTarget instanceof HTMLElement) {
        ReactDom.render(<QrCode level="L" value="placeholder" />, qrCodeTarget);
      }
    }
  }
}
registerHandlers(PostRenderBallotProcessor);

const UnpagedBallot = styled.div`
  display: none;
`;
const SealImage = styled.img`
  max-width: 1in;
`;
const Content = styled.div`
  flex: 1;
`;
const AbsenteeHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.125in;
  background: ${ABSENTEE_TINT_COLOR};
  height: 0.25in;
  text-transform: uppercase;
  letter-spacing: 0.025in;
  color: #fff;
`;
const AbsenteeFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 0.08in;
  background: ${ABSENTEE_TINT_COLOR};
  width: 1in;
  color: #fff;
`;
const Watermark = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  inset: 0;

  & > div {
    transform: rotate(305deg);
    color: #eaeaea;
    font-size: 18em;
    font-weight: 700;
  }
`;
const PageFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  position: relative;
  z-index: 1;
`;
const OfficialInitials = styled.div`
  /* stylelint-disable selector-class-pattern -- vendor class name */
  display: none;
  align-items: flex-start;
  justify-content: center;
  margin-right: 0.08in;
  border: 1px solid #000;
  width: 1in;

  .pagedjs_left_page & {
    display: flex;
  }
`;
const PageFooterMain = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: space-between;
  border-top: 1px solid #000;
  padding-top: 0.02in;

  & > div {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
  }

  h2 {
    margin: 0;
  }
`;
const PageFooterRow = styled.div`
  /* stylelint-disable no-descending-specificity */
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  margin-bottom: 0.05in;

  &:last-child {
    margin-bottom: 0;
  }

  & > div {
    display: flex;
    flex-direction: row;
    margin: 0 0.05in;

    &:first-child {
      margin-left: 0;
    }

    &:last-child {
      margin-right: 0;
    }

    &:empty {
      flex: 1;
    }
  }

  div + h2,
  h2 + div {
    margin-left: 0.05in;
  }
`;
const PageFooterQrCode = styled.div`
  margin-left: 0.15in;
  width: 0.55in;
  height: 0.55in;
`;
const PageFooterQrCodeOutline = styled(PageFooterQrCode)`
  border: 1px solid #000;
`;
const CandidateContestsLayout = styled.div`
  columns: 3;
  column-gap: 1em;
`;
const OtherContestsLayout = styled(CandidateContestsLayout)`
  columns: 2;
  break-before: column;
`;
const IntroColumn = styled.div`
  break-after: column;
  break-inside: avoid;
  page-break-inside: avoid;
`;
const BallotHeader = styled.div`
  margin-bottom: 2em;

  & h2 {
    margin-bottom: 0;
  }

  & h3 {
    margin-top: 0;
  }

  & > .seal {
    float: right;
    margin: 0 0 0.25em 0.25em;
    width: 1in;
  }
`;
const Instructions = styled.div`
  margin-bottom: 1em;

  img {
    float: right;
    margin: 0.05in 0 0.05in 0.05in;
    background: #fff;
    width: 45%;
  }

  h4 + p {
    margin-top: -1.3em;
  }

  h4:nth-child(2) {
    margin-top: 0;
  }
`;
export const StyledContest = styled.div<{ density?: number }>`
  margin-bottom: 1em;
  border: 0.2em solid #000;
  border-top-width: 0.3em;
  padding: ${({ density }) =>
    density === 2 ? '0.25em 0.5em' : density === 1 ? '0.5em' : '0.5em 1em 1em'};
  break-inside: avoid;
  page-break-inside: avoid;

  p + h3 {
    margin-top: ${({ density }) =>
      density === 1 || density === 2 ? '-0.3em' : '-0.6em'};
    line-height: 1.05;
  }
`;
interface ContestProps {
  districtName: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
  density?: number;
}
export function Contest({
  districtName,
  title,
  children,
  density,
}: ContestProps): JSX.Element {
  return (
    <StyledContest density={density}>
      <HandMarkedPaperBallotProse density={density}>
        <Text small bold>
          {districtName}
        </Text>
        <h3>{title}</h3>
        {children}
      </HandMarkedPaperBallotProse>
    </StyledContest>
  );
}
const StyledColumnFooter = styled.div`
  page-break-inside: avoid;
`;
const WriteInItem = styled.p`
  position: relative;
  margin: 0.5em 0 !important;
  page-break-inside: avoid;

  &:last-child {
    margin-bottom: 0 !important;
  }
`;

const WriteInName = styled.span`
  position: absolute;
  top: -5px;
  left: 40%;
  font-family: 'Edu TAS Beginner', Georgia, serif;
`;

const CandidateDescription = styled.span<{ isSmall?: boolean }>`
  font-size: ${({ isSmall }) => (isSmall ? '0.9em' : undefined)};
`;

export interface CandidateContestChoicesProps {
  election: Election;
  contest: CandidateContest;
  vote?: CandidateVote;
  density?: number;
  targetMarkPosition?: BallotTargetMarkPosition;
}

export function CandidateContestChoices({
  election,
  contest,
  density,
  vote,
  targetMarkPosition,
}: CandidateContestChoicesProps): JSX.Element {
  const writeInItemKeys = integers()
    .take(contest.seats)
    .map((num) => `write-in-${contest.id}-${num}`);
  return (
    <React.Fragment>
      {contest.candidates.map((candidate) => (
        <Text key={candidate.id} data-candidate>
          <BubbleMark
            position={targetMarkPosition}
            checked={hasVote(vote, candidate.id)}
          >
            <CandidateDescription isSmall>
              <strong data-candidate-name={candidate.name}>
                {candidate.name}
              </strong>
              {candidate.partyIds && candidate.partyIds.length > 0 && (
                <React.Fragment>
                  {density !== 2 ? <br /> : ' '}
                  <Text as="span" small={density !== 0}>
                    {getCandidatePartiesDescription(election, candidate)}
                  </Text>
                </React.Fragment>
              )}
            </CandidateDescription>
          </BubbleMark>
        </Text>
      ))}
      {contest.allowWriteIns &&
        writeInItemKeys
          .map((key, position) => (
            <WriteInItem key={key} data-write-in>
              <BubbleMark
                position={targetMarkPosition}
                checked={hasWriteInAtPosition(vote, position)}
              >
                <WriteInLine />
                <Text small noWrap as="span">
                  write-in
                </Text>
              </BubbleMark>
              {hasWriteInAtPosition(vote, position) && (
                <WriteInName>
                  {getWriteInNameAtPosition(vote, position)}
                </WriteInName>
              )}
            </WriteInItem>
          ))
          .toArray()}
    </React.Fragment>
  );
}

export interface HandMarkedPaperBallotProps {
  ballotStyleId: BallotStyleId;
  election: Election;
  electionHash: string;
  ballotMode?: BallotMode;
  isAbsentee?: boolean;
  precinctId: PrecinctId;
  ballotId?: BallotId;
  votes?: VotesDict;
  onRendered?(pageCount: number): void;
}

export function HandMarkedPaperBallot({
  ballotStyleId,
  election,
  electionHash,
  ballotMode = 'official',
  isAbsentee = true,
  precinctId,
  ballotId,
  votes,
  onRendered,
}: HandMarkedPaperBallotProps): JSX.Element {
  const layoutDensity = getBallotLayoutDensity(election);

  const { county, date, seal, sealUrl, state, title } = election;
  const primaryPartyName = !isSuperBallotStyle(ballotStyleId)
    ? getPartyFullNameFromBallotStyle({
        ballotStyleId,
        election,
      })
    : undefined;
  let ballotStyle: BallotStyle | undefined;
  if (isSuperBallotStyle(ballotStyleId)) {
    ballotStyle = undefined;
  } else {
    ballotStyle = getBallotStyle({ ballotStyleId, election });
    assert(ballotStyle);
  }
  const contests = ballotStyle
    ? getContests({ ballotStyle, election })
    : election.contests;
  const candidateContests = contests.filter((c) => c.type === 'candidate');
  const otherContests = contests.filter((c) => c.type !== 'candidate');
  const precinct = isSuperBallotStyle(ballotStyleId)
    ? { id: precinctId, name: 'All' }
    : getPrecinctById({ election, precinctId });
  assert(precinct);

  const unpagedBallotRef = useRef<HTMLDivElement>(null);
  const pagedBallotRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const ballotStylesheets = [
      `/ballot/ballot-layout-paper-size-${getBallotLayoutPageSize(
        election
      )}.css`,
      '/ballot/ballot.css',
    ];

    assert(pagedBallotRef.current);
    const pagedTarget = pagedBallotRef.current;
    const previewer = new Previewer();

    void (async () => {
      assert(unpagedBallotRef.current);
      const flow = await previewer.preview(
        unpagedBallotRef.current.innerHTML,
        ballotStylesheets,
        pagedTarget
      );

      const numPages = flow.pages.length;
      assert(numPages);
      onRendered?.(numPages);
    })();

    return () => {
      // Clear the Paged.js generated content
      pagedTarget.innerHTML = '';

      // Remove the Paged.js added stylesheets specific to this previewer
      previewer.polisher.destroy();
    };
  }, [
    ballotStyleId,
    election,
    electionHash,
    ballotMode,
    onRendered,
    precinctId,
    isAbsentee,
    votes,
  ]);

  const columnFooter = (
    <StyledColumnFooter>
      <HandMarkedPaperBallotProse>
        <h3>Thank you for voting.</h3>
        <p>
          You have reached the end of the ballot. Please review your ballot
          selections.
        </p>
      </HandMarkedPaperBallotProse>
    </StyledColumnFooter>
  );

  return (
    <React.Fragment>
      {/* div used as the target element for content chunked (paginated) by PagedJs */}
      <div ref={pagedBallotRef} />
      {/* div where we render our unpaginated ballot initially, hidden with display: none */}
      <UnpagedBallot aria-hidden data-ballot ref={unpagedBallotRef}>
        <div className="ballot-footer">
          <PageFooter>
            {isAbsentee && (
              <AbsenteeFooter>
                <Text bold as="span">
                  Absentee Ballot
                </Text>
              </AbsenteeFooter>
            )}
            <OfficialInitials>
              <Text as="span" small>
                Official’s Initials
              </Text>
            </OfficialInitials>
            <PageFooterMain>
              <PageFooterRow>
                <div>
                  <Text small right as="div">
                    Precinct
                  </Text>
                  <Text as="h2">{precinct.name}</Text>
                </div>
                <div>
                  <Text small right as="div">
                    Style
                  </Text>
                  <Text as="h2">{ballotStyle?.id || 'All'}</Text>
                </div>
                <div />
                <div>
                  <Text small right as="div">
                    Page
                  </Text>
                  <Text as="h2">
                    <span className="page-number" />
                    <span>/</span>
                    <span className="total-pages" />
                  </Text>
                  <Text small left as="div">
                    Pages
                  </Text>
                </div>
              </PageFooterRow>
              <PageFooterRow>
                <div>
                  <Text small left as="div">
                    {ballotStyle?.partyId && primaryPartyName
                      ? `${ballotStyle.partyId && primaryPartyName} ${title}`
                      : election.title}
                  </Text>
                </div>
                <div>
                  <Text small center as="div">
                    {county.name}, {state}
                  </Text>
                </div>
                <div>
                  <Text small right as="div">
                    {localeDateLong(date)}
                  </Text>
                </div>
              </PageFooterRow>
            </PageFooterMain>
            {['draft', 'sample'].includes(ballotMode) ? (
              <PageFooterQrCodeOutline />
            ) : (
              <PageFooterQrCode
                className={qrCodeTargetClassName}
                data-election={JSON.stringify(election)}
                data-metadata={JSON.stringify(
                  ((): HmpbBallotMetadata => ({
                    electionHash,
                    ballotStyleId,
                    precinctId,
                    isTestMode: ballotMode === 'test',
                    ballotType: isAbsentee
                      ? BallotType.Absentee
                      : BallotType.Standard,
                    ballotId,
                  }))()
                )}
              />
            )}
          </PageFooter>
        </div>

        <div className="watermark">
          {ballotMode === 'draft' && (
            <Watermark>
              <div>DRAFT</div>
            </Watermark>
          )}
          {ballotMode === 'sample' && (
            <Watermark>
              <div>SAMPLE</div>
            </Watermark>
          )}
        </div>

        <Content>
          <CandidateContestsLayout>
            <IntroColumn>
              {isAbsentee && (
                <AbsenteeHeader>
                  <Text bold>Absentee Ballot</Text>
                </AbsenteeHeader>
              )}
              <BallotHeader>
                {seal ? (
                  <div
                    className="seal"
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{
                      __html: DomPurify.sanitize(seal),
                    }}
                  />
                ) : sealUrl ? (
                  <div className="seal">
                    <SealImage src={sealUrl} alt="" />
                  </div>
                ) : null}
                <HandMarkedPaperBallotProse>
                  <h2>{ballotModeToBallotTitle(ballotMode)}</h2>
                  <h3>
                    {ballotStyle?.partyId && primaryPartyName} {title}
                  </h3>
                  <p>
                    {state}
                    <br />
                    {county.name}
                    <br />
                    {localeDateLong(date)}
                  </p>
                </HandMarkedPaperBallotProse>
              </BallotHeader>
              <Instructions>
                <HandMarkedPaperBallotProse>
                  <img
                    src="/ballot/instructions-fill-oval.svg"
                    alt=""
                    className="ignore-prose"
                  />
                  <h4>Instructions</h4>
                  <Text small>
                    To vote, use a black pen to completely fill in the oval to
                    the left of your choice.
                  </Text>
                  <h4>To Vote for a Write-In</h4>
                  <Text small>
                    <img src="/ballot/instructions-write-in.svg" alt="" />
                    To vote for a person not on the ballot, completely fill in
                    the oval to the left of the “write-in” line and print the
                    person’s name on the line.
                  </Text>
                  <h4>To correct a mistake</h4>
                  <Text small>
                    To make a correction, please ask for a replacement ballot.
                    Any marks other than filled ovals may cause your ballot not
                    to be counted.
                  </Text>
                </HandMarkedPaperBallotProse>
              </Instructions>
            </IntroColumn>
            {candidateContests.map((contest) => (
              <Contest
                key={contest.id}
                density={layoutDensity}
                districtName={getContestDistrictName(election, contest)}
                title={contest.title}
              >
                {contest.type === 'candidate' && (
                  <React.Fragment>
                    <Text small={layoutDensity !== 0}>
                      {contest.seats === 1
                        ? 'Vote for 1'
                        : `Vote for not more than ${format.count(
                            contest.seats
                          )}`}
                    </Text>
                    <CandidateContestChoices
                      election={election}
                      contest={contest}
                      vote={votes?.[contest.id] as CandidateVote | undefined}
                      density={layoutDensity}
                      targetMarkPosition={
                        election.ballotLayout.targetMarkPosition
                      }
                    />
                  </React.Fragment>
                )}
              </Contest>
            ))}
            {otherContests.length === 0 && columnFooter}
          </CandidateContestsLayout>
          {otherContests.length !== 0 && (
            <OtherContestsLayout>
              {otherContests.map((contest) => (
                <Contest
                  key={contest.id}
                  data-contest
                  data-contest-title={contest.title}
                  districtName={getContestDistrictName(election, contest)}
                  title={contest.title}
                >
                  {contest.type === 'yesno' && (
                    <React.Fragment>
                      <p>
                        Vote{' '}
                        <strong>{contest.yesOption?.label || 'Yes'}</strong> or{' '}
                        <strong>{contest.noOption?.label || 'No'}</strong>
                      </p>
                      <Text
                        small
                        preLine
                        dangerouslySetInnerHTML={{
                          __html: DomPurify.sanitize(contest.description),
                        }}
                      />

                      <Text bold>
                        <BubbleMark
                          position={election.ballotLayout.targetMarkPosition}
                          checked={hasVote(votes?.[contest.id], 'yes')}
                        >
                          <span>{contest.yesOption?.label || 'Yes'}</span>
                        </BubbleMark>
                      </Text>
                      <Text bold>
                        <BubbleMark
                          position={election.ballotLayout.targetMarkPosition}
                          checked={hasVote(votes?.[contest.id], 'no')}
                        >
                          <span>{contest.noOption?.label || 'No'}</span>
                        </BubbleMark>
                      </Text>
                    </React.Fragment>
                  )}
                </Contest>
              ))}
              {columnFooter}
            </OtherContestsLayout>
          )}
        </Content>
      </UnpagedBallot>
    </React.Fragment>
  );
}
