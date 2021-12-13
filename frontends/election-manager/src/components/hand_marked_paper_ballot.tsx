import { assert } from '@votingworks/utils';
import React, { useLayoutEffect, useRef, useContext } from 'react';
import ReactDom from 'react-dom';
import styled from 'styled-components';
import DomPurify from 'dompurify';
import moment from 'moment';
import 'moment/min/locales';
import { fromByteArray } from 'base64-js';
import { Handler, Previewer, registerHandlers } from 'pagedjs';
import { TFunction, StringMap } from 'i18next';
import { useTranslation, Trans } from 'react-i18next';
import {
  AnyContest,
  BallotLocale,
  BallotType,
  Candidate,
  CandidateContest,
  CandidateVote,
  Dictionary,
  Election,
  HmpbBallotPageMetadata,
  OptionalElection,
  Parties,
  Vote,
  VotesDict,
  YesNoContest,
  getBallotStyle,
  getContests,
  getPartyFullNameFromBallotStyle,
  getPrecinctById,
  withLocale,
  safeParseElection,
  ContestOption,
  BallotStyleId,
  PrecinctId,
  BallotId,
} from '@votingworks/types';

import { encodeHmpbBallotPageMetadata } from '@votingworks/ballot-encoder';
import { AppContext } from '../contexts/app_context';

import { findPartyById } from '../utils/find_party_by_id';

import { BubbleMark } from './bubble_mark';
import { WriteInLine } from './write_in_line';
import { QrCode } from './qrcode';
import { Prose } from './prose';
import { Text } from './text';
import { HorizontalRule } from './horizontal_rule';
import { ABSENTEE_TINT_COLOR } from '../config/globals';
import { getBallotLayoutPageSize } from '../utils/get_ballot_layout_page_size';
import { getBallotLayoutDensity } from '../utils/get_ballot_layout_density';

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

function localeDateLong(dateString: string, locale: string) {
  return moment(new Date(dateString)).locale(locale).format('LL');
}

function dualPhraseWithBreak(t1: string, t2?: string) {
  if (!t2 || t1 === t2) {
    return t1;
  }
  return (
    <React.Fragment>
      <strong>{t1}</strong>
      <br />
      {t2}
    </React.Fragment>
  );
}

function dualPhraseWithSlash(
  t1: string,
  t2?: string,
  {
    separator = ' / ',
    normal = false,
  }: { separator?: string; normal?: boolean } = {}
) {
  if (!t2 || t1 === t2) {
    return t1;
  }
  if (normal) {
    return (
      <React.Fragment>
        {t1}
        {separator}
        <Text normal as="span">
          {t2}
        </Text>
      </React.Fragment>
    );
  }
  return `${t1}${separator}${t2}`;
}

function dualLanguageComposer(
  t: TFunction,
  locales: BallotLocale,
  separator?: string
) {
  return (key: string, options: StringMap = {}) => {
    const enTranslation = t(key, {
      ...options,
      lng: locales.primary,
    });
    if (!locales.secondary) {
      return enTranslation;
    }
    const dualTranslation = t(key, {
      ...options,
      lng: locales.secondary,
    });
    if (separator === 'break') {
      return dualPhraseWithBreak(enTranslation, dualTranslation);
    }
    return dualPhraseWithSlash(enTranslation, dualTranslation, {
      separator,
      normal: true,
    });
  };
}

const qrCodeTargetClassName = 'qr-code-target';

const BlankPageContent = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
`;

type HmpbBallotMetadata = Omit<HmpbBallotPageMetadata, 'pageNumber'>;

interface HmpbBallotMetadataRender extends HmpbBallotMetadata {
  readonly isSampleBallot: boolean;
}

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
            <Prose>
              <p>This ballot page is intentionally blank.</p>
            </Prose>
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
      const { pageNumber } = page.element.dataset;
      assert(typeof pageNumber !== 'undefined');
      const qrCodeTarget = page.element.getElementsByClassName(
        qrCodeTargetClassName
      )[0];
      if (qrCodeTarget && qrCodeTarget instanceof HTMLElement) {
        const election = safeParseElection(
          qrCodeTarget.dataset.election ?? ''
        ).unsafeUnwrap();
        const {
          electionHash,
          precinctId,
          ballotStyleId,
          isTestMode,
          isSampleBallot,
          locales,
          ballotType,
          ballotId,
        }: HmpbBallotMetadataRender = JSON.parse(
          qrCodeTarget.dataset.metadata ?? ''
        );

        const encoded = encodeHmpbBallotPageMetadata(election, {
          electionHash: electionHash.substring(0, 20),
          ballotStyleId,
          precinctId,
          locales,
          isTestMode,
          // eslint-disable-next-line vx/gts-safe-number-parse
          pageNumber: parseInt(pageNumber, 10),
          ballotType,
          ballotId,
        });

        if (!isSampleBallot) {
          ReactDom.render(
            <QrCode level="L" value={fromByteArray(encoded)} />,
            qrCodeTarget
          );
        }
      }
    }
  }
}
registerHandlers(PostRenderBallotProcessor);

const Ballot = styled.div`
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
  color: #ffffff;
`;
const AbsenteeFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 0.08in;
  background: ${ABSENTEE_TINT_COLOR};
  width: 1in;
  color: #ffffff;
`;
const Watermark = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
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
  display: none;
  align-items: flex-start;
  justify-content: center;
  margin-right: 0.08in;
  border: 1px solid #000000;
  width: 1in;
  /* stylelint-disable-next-line selector-class-pattern */
  .pagedjs_left_page & {
    display: flex;
  }
`;
const PageFooterMain = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: space-between;
  border-top: 1px solid #000000;
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
const PageFooterQrCode = styled.div<{ isSampleBallot: boolean }>`
  margin-left: 0.15in;
  border: ${({ isSampleBallot }) =>
    isSampleBallot ? '1px solid #000000' : undefined};
  width: 0.55in;
  height: 0.55in;
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
    background: #ffffff;
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
  border: 0.2em solid #000000;
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
  section: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
  density?: number;
}
export function Contest({
  section,
  title,
  children,
  density,
}: ContestProps): JSX.Element {
  return (
    <StyledContest density={density}>
      <Prose density={density}>
        <Text small bold>
          {section}
        </Text>
        <h3>{title}</h3>
        {children}
      </Prose>
    </StyledContest>
  );
}
const StyledColumnFooter = styled.div`
  page-break-inside: avoid;
`;
const WriteInItem = styled.p`
  margin: 0.5em 0 !important; /* stylelint-disable-line declaration-no-important */
  page-break-inside: avoid;
  &:last-child {
    margin-bottom: 0 !important; /* stylelint-disable-line declaration-no-important */
  }
`;

const CandidateDescription = styled.span<{ isSmall?: boolean }>`
  font-size: ${({ isSmall }) => (isSmall ? '0.9em' : undefined)};
`;

export interface CandidateContestChoicesProps {
  contest: CandidateContest;
  locales: BallotLocale;
  parties: Parties;
  vote?: CandidateVote;
  density?: number;
}

export function CandidateContestChoices({
  contest,
  density,
  locales,
  parties,
  vote,
}: CandidateContestChoicesProps): JSX.Element {
  const { t } = useTranslation();
  const writeInCandidates = vote?.filter((c) => c.isWriteIn);
  const remainingChoices = [...Array.from({ length: contest.seats }).keys()];
  const dualLanguageWithSlash = dualLanguageComposer(t, locales);
  return (
    <React.Fragment>
      {contest.candidates.map((candidate) => (
        <Text key={candidate.id} data-candidate>
          <BubbleMark checked={hasVote(vote, candidate.id)}>
            <CandidateDescription isSmall>
              <strong data-candidate-name={candidate.name}>
                {candidate.name}
              </strong>
              {candidate.partyId && (
                <React.Fragment>
                  {density !== 2 ? <br /> : ' '}
                  <Text as="span" small={density !== 0}>
                    {findPartyById(parties, candidate.partyId)?.name}
                  </Text>
                </React.Fragment>
              )}
            </CandidateDescription>
          </BubbleMark>
        </Text>
      ))}
      {writeInCandidates?.map((candidate) => (
        <Text key={candidate.name} bold noWrap>
          <BubbleMark checked>
            <span>
              <strong>{candidate.name}</strong> (
              {dualLanguageWithSlash('write-in')})
            </span>
          </BubbleMark>
        </Text>
      ))}
      {contest.allowWriteIns &&
        remainingChoices.map((k) => (
          <WriteInItem key={k} data-write-in>
            <BubbleMark>
              <WriteInLine />
              <Text small noWrap as="span">
                {dualLanguageWithSlash('write-in')}
              </Text>
            </BubbleMark>
          </WriteInItem>
        ))}
    </React.Fragment>
  );
}

export interface HandMarkedPaperBallotProps {
  ballotStyleId: BallotStyleId;
  election: Election;
  electionHash: string;
  isLiveMode?: boolean;
  isAbsentee?: boolean;
  isSampleBallot?: boolean;
  precinctId: PrecinctId;
  locales: BallotLocale;
  ballotId?: BallotId;
  votes?: VotesDict;
  onRendered?(props: Omit<HandMarkedPaperBallotProps, 'onRendered'>): void;
}

export function HandMarkedPaperBallot({
  ballotStyleId,
  election,
  electionHash,
  isLiveMode = true,
  isAbsentee = true,
  isSampleBallot = false,
  precinctId,
  locales,
  ballotId,
  votes,
  onRendered,
}: HandMarkedPaperBallotProps): JSX.Element {
  const layoutDensity = getBallotLayoutDensity(election);
  assert.notEqual(
    locales.primary,
    locales.secondary,
    'rendering a dual-language ballot with both languages the same is not allowed'
  );

  const { t, i18n } = useTranslation();
  const { printBallotRef } = useContext(AppContext);
  const {
    county,
    date,
    seal,
    sealURL: sealUrl,
    state,
    parties,
    title,
  } = election;
  const localeElection: OptionalElection = locales.secondary
    ? withLocale(election, locales.secondary)
    : undefined;
  i18n.addResources(locales.primary, 'translation', election.ballotStrings);
  if (localeElection && locales.secondary) {
    i18n.addResources(
      locales.secondary,
      'translation',
      localeElection.ballotStrings
    );
  }
  const primaryPartyName = getPartyFullNameFromBallotStyle({
    ballotStyleId,
    election,
  });
  const localePrimaryPartyName =
    localeElection &&
    getPartyFullNameFromBallotStyle({
      ballotStyleId,
      election: localeElection,
    });
  const ballotStyle = getBallotStyle({ ballotStyleId, election });
  assert(ballotStyle);
  const contests = getContests({ ballotStyle, election });
  const candidateContests = contests.filter((c) => c.type === 'candidate');
  const otherContests = contests.filter((c) => c.type !== 'candidate');
  const localeContestsById =
    localeElection &&
    getContests({ ballotStyle, election: localeElection }).reduce<
      Dictionary<AnyContest>
    >(
      (prev, curr) => ({
        ...prev,
        [curr.id]: curr,
      }),
      {}
    );
  const precinct = getPrecinctById({ election, precinctId });
  assert(precinct);

  const ballotRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!printBallotRef?.current) {
      return;
    }

    const ballotStylesheets = [
      `/ballot/ballot-layout-paper-size-${getBallotLayoutPageSize(
        election
      )}.css`,
      '/ballot/ballot.css',
    ];

    void (async () => {
      assert(ballotRef.current);
      await new Previewer().preview(
        ballotRef.current.innerHTML,
        ballotStylesheets,
        printBallotRef?.current
      );
      onRendered?.({
        ballotStyleId,
        election,
        electionHash,
        isLiveMode,
        isAbsentee,
        isSampleBallot,
        precinctId,
        votes,
        locales,
      });
    })();

    return () => {
      if (printBallotRef.current) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        printBallotRef.current.innerHTML = '';
      }
      document.head
        .querySelectorAll('[data-pagedjs-inserted-styles]')
        .forEach((e) => e.parentNode?.removeChild(e));
    };
  }, [
    ballotStyleId,
    election,
    electionHash,
    isLiveMode,
    isSampleBallot,
    onRendered,
    precinctId,
    isAbsentee,
    printBallotRef,
    locales,
    votes,
  ]);

  const dualLanguageWithSlash = dualLanguageComposer(t, locales);
  const dualLanguageWithBreak = dualLanguageComposer(t, locales, 'break');

  const columnFooter = (
    <StyledColumnFooter>
      <Prose>
        <h3>
          {dualLanguageWithBreak('Thank you for voting.', {
            normal: true,
          })}
        </h3>
        <p>
          {dualLanguageWithBreak(
            'You have reached the end of the ballot. Please review your ballot selections.'
          )}
        </p>
      </Prose>
    </StyledColumnFooter>
  );

  return (
    <Ballot aria-hidden data-ballot ref={ballotRef}>
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
              <Trans
                i18nKey="officialInitials"
                tOptions={{ lng: locales.primary }}
              >
                Official’s Initials
              </Trans>
            </Text>
          </OfficialInitials>
          <PageFooterMain>
            <PageFooterRow>
              <div>
                <Text small right as="div">
                  {dualLanguageWithBreak('Precinct')}
                </Text>
                <Text as="h2">{precinct.name}</Text>
              </div>
              <div>
                <Text small right as="div">
                  {dualLanguageWithBreak('Style')}
                </Text>
                <Text as="h2">{ballotStyle.id}</Text>
              </div>
              <div />
              <div>
                <Text small right as="div">
                  {dualLanguageWithBreak('Page')}
                </Text>
                <Text as="h2">
                  <span className="page-number" />
                  <span>/</span>
                  <span className="total-pages" />
                </Text>
                <Text small left as="div">
                  {dualLanguageWithBreak('Pages')}
                </Text>
              </div>
            </PageFooterRow>
            <PageFooterRow>
              <div>
                <Text small left as="div">
                  {ballotStyle.partyId &&
                  primaryPartyName &&
                  localePrimaryPartyName
                    ? dualPhraseWithBreak(
                        `${ballotStyle.partyId && primaryPartyName} ${title}`,
                        localeElection &&
                          t('{{primaryPartyName}} {{electionTitle}}', {
                            lng: locales.secondary,
                            primaryPartyName: localePrimaryPartyName,
                            electionTitle: localeElection.title,
                          })
                      )
                    : dualPhraseWithBreak(
                        election.title,
                        localeElection?.title
                      )}
                </Text>
              </div>
              <div>
                <Text small center as="div">
                  {dualPhraseWithBreak(
                    `${county.name}, ${state}`,
                    localeElection &&
                      `${localeElection.county.name}, ${localeElection.state}`
                  )}
                </Text>
              </div>
              <div>
                <Text small right as="div">
                  {locales.secondary ? (
                    <React.Fragment>
                      <strong>{localeDateLong(date, locales.primary)}</strong>
                      <br />
                      {localeDateLong(date, locales.secondary)}
                    </React.Fragment>
                  ) : (
                    <React.Fragment>
                      {localeDateLong(date, locales.primary)}
                    </React.Fragment>
                  )}
                </Text>
              </div>
            </PageFooterRow>
          </PageFooterMain>
          <PageFooterQrCode
            className={qrCodeTargetClassName}
            isSampleBallot={isSampleBallot}
            data-election={JSON.stringify(election)}
            data-metadata={JSON.stringify(
              ((): HmpbBallotMetadataRender => ({
                electionHash,
                ballotStyleId,
                precinctId,
                locales,
                isTestMode: !isLiveMode,
                isSampleBallot,
                ballotType: isAbsentee
                  ? BallotType.Absentee
                  : BallotType.Standard,
                ballotId,
              }))()
            )}
          />
        </PageFooter>
      </div>

      <div className="watermark">
        {isSampleBallot && (
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
              ) : (
                <React.Fragment />
              )}
              <Prose>
                <h2>
                  {isSampleBallot
                    ? t('SAMPLE BALLOT', { lng: locales.primary })
                    : isLiveMode
                    ? t('Official Ballot', { lng: locales.primary })
                    : t('TEST BALLOT', { lng: locales.primary })}
                </h2>
                <h3>
                  {ballotStyle.partyId && primaryPartyName} {title}
                </h3>
                <p>
                  {state}
                  <br />
                  {county.name}
                  <br />
                  {localeDateLong(date, locales.primary)}
                </p>
                {localeElection && locales.secondary && (
                  <p>
                    <strong>
                      {isSampleBallot
                        ? t('SAMPLE BALLOT', { lng: locales.secondary })
                        : isLiveMode
                        ? t('Official Ballot', { lng: locales.secondary })
                        : t('TEST BALLOT', {
                            lng: locales.secondary,
                          })}
                    </strong>
                    <br />
                    <strong>
                      {ballotStyle.partyId && primaryPartyName
                        ? t('{{primaryPartyName}} {{electionTitle}}', {
                            lng: locales.secondary,
                            primaryPartyName: localePrimaryPartyName,
                            electionTitle: localeElection.title,
                          })
                        : localeElection.title}
                    </strong>
                    <br />
                    {localeElection.state}
                    <br />
                    {localeElection.county.name}
                    <br />
                    {localeDateLong(date, locales.secondary)}
                  </p>
                )}
              </Prose>
            </BallotHeader>
            <Instructions>
              <Prose>
                <img
                  src="/ballot/instructions-fill-oval.svg"
                  alt=""
                  className="ignore-prose"
                />
                <h4>{t('Instructions', { lng: locales.primary })}</h4>
                <Text small>
                  {t(
                    'To vote, use a black pen to completely fill in the oval to the left of your choice.',
                    { lng: locales.primary }
                  )}
                </Text>
                <h4>{t('To Vote for a Write-In', { lng: locales.primary })}</h4>
                <Text small>
                  <img src="/ballot/instructions-write-in.svg" alt="" />
                  {t(
                    'To vote for a person not on the ballot, completely fill in the oval to the left of the “write-in” line and print the person’s name on the line.',
                    { lng: locales.primary }
                  )}
                </Text>
                <h4>{t('To correct a mistake', { lng: locales.primary })}</h4>
                <Text small>
                  {t(
                    'To make a correction, please ask for a replacement ballot. Any marks other than filled ovals may cause your ballot not to be counted.',
                    { lng: locales.primary }
                  )}
                </Text>
                {locales.secondary && (
                  <React.Fragment>
                    <HorizontalRule />
                    <img
                      src="/ballot/instructions-fill-oval.svg"
                      alt=""
                      className="ignore-prose"
                    />
                    <h4>{t('Instructions', { lng: locales.secondary })}</h4>
                    <Text small>
                      {t(
                        'To vote, use a black pen to completely fill in the oval to the left of your choice.',
                        { lng: locales.secondary }
                      )}
                    </Text>
                    <h4>
                      {t('To Vote for a Write-In', {
                        lng: locales.secondary,
                      })}
                    </h4>
                    <Text small>
                      <img src="/ballot/instructions-write-in.svg" alt="" />
                      {t(
                        'To vote for a person not on the ballot, completely fill in the oval to the left of the “write-in” line and print the person’s name on the line.',
                        { lng: locales.secondary }
                      )}
                    </Text>
                    <h4>
                      {t('To correct a mistake', {
                        lng: locales.secondary,
                      })}
                    </h4>
                    <Text small>
                      {t(
                        'To make a correction, please ask for a replacement ballot. Any marks other than filled ovals may cause your ballot not to be counted.',
                        { lng: locales.secondary }
                      )}
                    </Text>
                  </React.Fragment>
                )}
              </Prose>
            </Instructions>
          </IntroColumn>
          {candidateContests.map((contest) => (
            <Contest
              key={contest.id}
              density={layoutDensity}
              section={dualPhraseWithSlash(
                contest.section,
                localeContestsById?.[contest.id]?.section,
                { normal: true }
              )}
              title={dualPhraseWithSlash(
                contest.title,
                localeContestsById?.[contest.id]?.title,
                { normal: true }
              )}
            >
              {contest.type === 'candidate' && (
                <React.Fragment>
                  <Text small={layoutDensity !== 0}>
                    {contest.seats === 1
                      ? dualLanguageWithSlash('Vote for 1', {
                          normal: true,
                        })
                      : dualLanguageWithSlash(
                          'Vote for not more than {{ seats }}',
                          { seats: contest.seats, normal: true }
                        )}
                  </Text>
                  <CandidateContestChoices
                    contest={contest}
                    parties={parties}
                    vote={votes?.[contest.id] as CandidateVote | undefined}
                    locales={locales}
                    density={layoutDensity}
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
                section={dualPhraseWithSlash(
                  contest.section,
                  localeContestsById?.[contest.id]?.section,
                  { normal: true }
                )}
                title={dualPhraseWithSlash(
                  contest.title,
                  localeContestsById?.[contest.id]?.title,
                  { normal: true }
                )}
              >
                {contest.type === 'yesno' && (
                  <React.Fragment>
                    <p>
                      <Trans
                        i18nKey="voteYesOrNo"
                        tOptions={{ lng: locales.primary }}
                      >
                        Vote{' '}
                        <strong>{contest.yesOption?.label || 'Yes'}</strong> or{' '}
                        <strong>{contest.noOption?.label || 'No'}</strong>
                      </Trans>
                      {locales.secondary && (
                        <React.Fragment>
                          {' / '}
                          <Trans
                            i18nKey="voteYesOrNo"
                            tOptions={{ lng: locales.secondary }}
                          >
                            Vote{' '}
                            <strong>{contest.yesOption?.label || 'Yes'}</strong>{' '}
                            or{' '}
                            <strong>{contest.noOption?.label || 'No'}</strong>
                          </Trans>
                        </React.Fragment>
                      )}
                    </p>
                    <Text
                      small
                      preLine
                      dangerouslySetInnerHTML={{
                        __html: DomPurify.sanitize(contest.description),
                      }}
                    />
                    {localeContestsById && (
                      <Text
                        small
                        preLine
                        dangerouslySetInnerHTML={{
                          __html: DomPurify.sanitize(
                            (localeContestsById[contest.id] as YesNoContest)
                              .description
                          ),
                        }}
                      />
                    )}
                    <Text bold noWrap>
                      <BubbleMark checked={hasVote(votes?.[contest.id], 'yes')}>
                        <span>
                          {dualLanguageWithSlash(
                            contest.yesOption?.label || 'Yes'
                          )}
                        </span>
                      </BubbleMark>
                    </Text>
                    <Text bold noWrap>
                      <BubbleMark checked={hasVote(votes?.[contest.id], 'no')}>
                        <span>
                          {dualLanguageWithSlash(
                            contest.noOption?.label || 'No'
                          )}
                        </span>
                      </BubbleMark>
                    </Text>
                  </React.Fragment>
                )}
                {contest.type === 'ms-either-neither' && (
                  <React.Fragment>
                    <Text
                      small
                      preLine
                      dangerouslySetInnerHTML={{
                        __html: DomPurify.sanitize(contest.description),
                      }}
                    />
                    {localeContestsById && (
                      <Text
                        small
                        preLine
                        dangerouslySetInnerHTML={{
                          __html: DomPurify.sanitize(
                            (localeContestsById[contest.id] as YesNoContest)
                              .description
                          ),
                        }}
                      />
                    )}
                    <p>{contest.eitherNeitherLabel}</p>
                    <Text key={contest.eitherOption.id} bold>
                      <BubbleMark
                        checked={hasVote(
                          votes?.[contest.eitherNeitherContestId],
                          'yes'
                        )}
                      >
                        <span>
                          {dualLanguageWithSlash(contest.eitherOption.label)}
                        </span>
                      </BubbleMark>
                    </Text>
                    <Text key={contest.neitherOption.id} bold>
                      <BubbleMark
                        checked={hasVote(
                          votes?.[contest.eitherNeitherContestId],
                          'no'
                        )}
                      >
                        <span>
                          {dualLanguageWithSlash(contest.neitherOption.label)}
                        </span>
                      </BubbleMark>
                    </Text>
                    <p>{contest.pickOneLabel}</p>
                    <Text key={contest.firstOption.id} bold>
                      <BubbleMark
                        checked={hasVote(
                          votes?.[contest.pickOneContestId],
                          'yes'
                        )}
                      >
                        <span>
                          {dualLanguageWithSlash(contest.firstOption.label)}
                        </span>
                      </BubbleMark>
                    </Text>
                    <Text key={contest.secondOption.id} bold>
                      <BubbleMark
                        checked={hasVote(
                          votes?.[contest.pickOneContestId],
                          'no'
                        )}
                      >
                        <span>
                          {dualLanguageWithSlash(contest.secondOption.label)}
                        </span>
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
    </Ballot>
  );
}
