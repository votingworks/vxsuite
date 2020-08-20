import { strict as assert } from 'assert'
import React, { useLayoutEffect, useRef, useContext } from 'react'
import ReactDOM from 'react-dom'
import styled from 'styled-components'
import moment from 'moment'
import 'moment/min/locales'
import { Handler, Previewer, registerHandlers } from 'pagedjs'
import { TFunction, StringMap } from 'i18next'
import { useTranslation, Trans } from 'react-i18next'
import {
  BallotStyle,
  CandidateContest,
  CandidateVote,
  Election,
  OptionalElection,
  Parties,
  Precinct,
  VotesDict,
  withLocale,
  YesNoContest,
} from '@votingworks/ballot-encoder'

import AppContext from '../contexts/AppContext'

import findPartyById from '../utils/findPartyById'
import {
  getBallotStyle,
  getContests,
  getPartyFullNameFromBallotStyle,
  getPrecinctById,
} from '../utils/election'

import BubbleMark from './BubbleMark'
import WriteInLine from './WriteInLine'
import QRCode from './QRCode'
import Prose from './Prose'
import Text from './Text'
import HorizontalRule from './HorizontalRule'
import { BallotLocale } from '../config/types'

const localeDateLong = (dateString: string, locale: string) =>
  moment(new Date(dateString)).locale(locale).format('LL')

const dualPhraseWithBreak = (t1: string, t2?: string) => {
  if (!t2 || t1 === t2) {
    return t1
  }
  return (
    <React.Fragment>
      <strong>{t1}</strong>
      <br />
      {t2}
    </React.Fragment>
  )
}

const dualPhraseWithSlash = (
  t1: string,
  t2?: string,
  {
    separator = ' / ',
    normal = false,
  }: { separator?: string; normal?: boolean } = {}
) => {
  if (!t2 || t1 === t2) {
    return t1
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
    )
  }
  return `${t1}${separator}${t2}`
}

const dualLanguageComposer = (
  t: TFunction,
  locales: BallotLocale,
  separator?: string
) => (key: string, options?: StringMap) => {
  const enTranslation = t(key, {
    ...options,
    lng: locales.primary,
  })
  if (!locales.secondary) {
    return enTranslation
  }
  const dualTranslation = t(key, {
    ...options,
    lng: locales.secondary,
  })
  if (separator === 'break') {
    return dualPhraseWithBreak(enTranslation, dualTranslation)
  }
  return dualPhraseWithSlash(enTranslation, dualTranslation, {
    separator,
    normal: true,
  })
}

const ballotMetadata = ({
  isLiveMode,
  precinctId,
  ballotStyleId,
  pageNumber,
  pageCount,
  primaryLocaleCode,
  secondaryLocaleCode,
  ballotId,
}: {
  isLiveMode: boolean
  precinctId: Precinct['id']
  ballotStyleId: BallotStyle['id']
  pageNumber: number
  pageCount: number
  primaryLocaleCode: string
  secondaryLocaleCode: string
  ballotId?: string
}): string => {
  const params = new URLSearchParams([
    ['t', `${!isLiveMode ? 't' : '_'}`],
    ['pr', precinctId],
    ['bs', ballotStyleId],
    ['l1', primaryLocaleCode],
    ['l2', secondaryLocaleCode],
    ['p', `${pageNumber}-${pageCount}`],
  ])

  if (ballotId) {
    params.append('id', ballotId)
  }

  return new URL(`https://ballot.page/?${params}`).toString()
}

const qrCodeTargetClassName = 'qr-code-target'

const BlankPageContent = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
`

interface PagedJSPage {
  element: {
    dataset: {
      pageNumber: string
    }
  }
  id: string
}
class PostRenderBallotProcessor extends Handler {
  afterRendered(pages: PagedJSPage[]) {
    // Insert blank page if ballot page count is odd.
    if (pages.length % 2) {
      const pagedjsPages = document.getElementsByClassName('pagedjs_pages')[0]
      if (pagedjsPages.lastChild) {
        pagedjsPages.appendChild(pagedjsPages.lastChild.cloneNode(true))
        pagedjsPages.setAttribute(
          'style',
          `--pagedjs-page-count:${pages.length + 1};`
        )
        const lastPage = document.getElementsByClassName('pagedjs_pages')[0]
          .lastChild! as Element
        lastPage.id = `page-${pages.length + 1}`
        lastPage.classList.remove('pagedjs_first_page', 'pagedjs_right_page')
        lastPage.classList.add('pagedjs_left_page')
        lastPage.setAttribute('data-page-number', `${pages.length + 1}`)
        ReactDOM.render(
          <BlankPageContent>
            <Prose>
              <p>This ballot page is intentionally blank.</p>
            </Prose>
          </BlankPageContent>,
          lastPage.getElementsByClassName('pagedjs_page_content')[0]
        )
        pages.push({
          ...pages[pages.length - 1],
          element: {
            dataset: {
              pageNumber: `${pages.length + 1}`,
            },
          },
          id: `page-${pages.length + 1}`,
        })
      }
    }

    // Post-process QR codes in footer.
    pages.forEach((page) => {
      const { pageNumber } = page.element.dataset
      const qrCodeTarget = document
        .getElementById(page.id)
        ?.getElementsByClassName(qrCodeTargetClassName)[0]
      const {
        precinctId = '',
        ballotStyleId = '',
        isLiveMode = '',
        primaryLocaleCode = '',
        secondaryLocaleCode = '',
        ballotId = '',
      } = (qrCodeTarget as HTMLDivElement)?.dataset
      if (qrCodeTarget) {
        ReactDOM.render(
          <QRCode
            level="L"
            value={ballotMetadata({
              isLiveMode: isLiveMode === 'true',
              precinctId,
              ballotStyleId,
              pageNumber: parseInt(pageNumber, 10),
              pageCount: pages.length,
              primaryLocaleCode,
              secondaryLocaleCode,
              ballotId,
            })}
          />,
          qrCodeTarget
        )
      }
    })
  }
}
registerHandlers(PostRenderBallotProcessor)

const Ballot = styled.div`
  display: none;
  flex-direction: column;
  width: 8.5in;
  min-height: 11in;
  font-size: 14px;
  page-break-after: always;
`
const SealImage = styled.img`
  max-width: 1in;
`
const Content = styled.div`
  flex: 1;
`
const PageFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  /* stylelint-disable-next-line selector-class-pattern */
  .pagedjs_left_page & {
    margin-left: 0.66in;
  }
`
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
`
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
`
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
`
const PageFooterQRCode = styled.div`
  margin-left: 0.225in;
  width: 0.475in;
`
const BallotColumns = styled.div`
  columns: 3;
  column-gap: 1em;
`
const IntroColumn = styled.div`
  break-after: column;
  break-inside: avoid;
  page-break-inside: avoid;
`
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
`
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
`
const Contest = styled.div`
  margin-bottom: 1em;
  border: 0.05em solid #000000;
  border-top-width: 0.2em;
  padding: 0.5em 1em 1em;
  break-inside: avoid;
  page-break-inside: avoid;
  p + h3 {
    margin-top: -0.6em;
  }
`
const ColumnFooter = styled.div`
  page-break-inside: avoid;
`
const WriteInItem = styled.p`
  margin: 0.5em 0 !important; /* stylelint-disable-line declaration-no-important */
  page-break-inside: avoid;
  &:last-child {
    margin-bottom: 0 !important; /* stylelint-disable-line declaration-no-important */
  }
`

const CandidateContestChoices = ({
  contest,
  locales,
  parties,
  vote = [],
}: {
  contest: CandidateContest
  locales: BallotLocale
  parties: Parties
  vote: CandidateVote
}) => {
  const { t } = useTranslation()
  const writeInCandidates = vote.filter((c) => c.isWriteIn)
  const remainingChoices = [...Array(contest.seats - vote.length).keys()]
  const dualLanguageWithSlash = dualLanguageComposer(t, locales)
  return (
    <React.Fragment>
      {contest.candidates.map((candidate) => (
        <Text key={candidate.id} data-candidate>
          <BubbleMark checked={vote.some((v) => v.id === candidate.id)}>
            <span>
              <strong data-candidate-name={candidate.name}>
                {candidate.name}
              </strong>
              {candidate.partyId && (
                <React.Fragment>
                  <br />
                  {findPartyById(parties, candidate.partyId)!.name}
                </React.Fragment>
              )}
            </span>
          </BubbleMark>
        </Text>
      ))}
      {writeInCandidates.map((candidate) => (
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
  )
}

interface Props {
  ballotStyleId: string
  election: Election
  isLiveMode?: boolean
  precinctId: string
  locales: BallotLocale
  ballotId?: string
  votes?: VotesDict
  onRendered?(props: Omit<Props, 'onRendered'>): void
}

const HandMarkedPaperBallot = ({
  ballotStyleId,
  election,
  isLiveMode = true,
  precinctId,
  locales,
  ballotId,
  votes = {},
  onRendered,
}: Props) => {
  assert.notEqual(
    locales.primary,
    locales.secondary,
    'rendering a dual-language ballot with both languages the same is not allowed'
  )

  const { t, i18n } = useTranslation()
  const { printBallotRef } = useContext(AppContext)
  const { county, date, seal, sealURL, state, parties, title } = election
  const localeElection: OptionalElection = locales.secondary
    ? withLocale(election, locales.secondary)
    : undefined
  i18n.addResources(locales.primary, 'translation', election.ballotStrings)
  if (localeElection && locales.secondary) {
    i18n.addResources(
      locales.secondary,
      'translation',
      localeElection.ballotStrings
    )
  }
  const primaryPartyName = getPartyFullNameFromBallotStyle({
    ballotStyleId,
    election,
  })
  const localePrimaryPartyName =
    localeElection &&
    getPartyFullNameFromBallotStyle({
      ballotStyleId,
      election: localeElection,
    })
  const ballotStyle = getBallotStyle({ ballotStyleId, election })
  const contests = getContests({ ballotStyle, election })
  const localeContests =
    localeElection && getContests({ ballotStyle, election: localeElection })
  const precinct = getPrecinctById({ election, precinctId })!

  const ballotRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const printBallot = printBallotRef?.current

    if (!printBallot) {
      return
    }

    const ballotStylesheets = [
      `/ballot/layout-${locales.secondary ? 'dual' : 'single'}-language.css`,
      '/ballot/ballot.css',
    ]

    if (process.env.NODE_ENV === 'development') {
      ballotStylesheets.push('/ballot/ballot-development.css')
    }

    ;(async () => {
      await new Previewer().preview(
        ballotRef.current!.innerHTML,
        ballotStylesheets,
        printBallot
      )
      onRendered?.({
        ballotStyleId,
        election,
        isLiveMode,
        precinctId,
        votes,
        locales,
      })
    })()

    return () => {
      printBallot.innerHTML = ''
    }
  }, [
    ballotStyleId,
    election,
    isLiveMode,
    onRendered,
    precinctId,
    printBallotRef,
    locales,
    votes,
  ])

  const dualLanguageWithSlash = dualLanguageComposer(t, locales)
  const dualLanguageWithBreak = dualLanguageComposer(t, locales, 'break')

  return (
    <React.Fragment>
      <Ballot aria-hidden data-ballot ref={ballotRef}>
        <div className="ballot-footer">
          <PageFooter>
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
                          localeElection && localeElection.title
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
            <PageFooterQRCode
              className={qrCodeTargetClassName}
              data-is-live-mode={isLiveMode}
              data-precinct-id={precinctId}
              data-ballot-style-id={ballotStyleId}
              data-primary-locale-code={locales.primary}
              data-secondary-locale-code={locales.secondary}
              data-ballot-id={ballotId}
            />
          </PageFooter>
        </div>

        <Content>
          <BallotColumns>
            <IntroColumn>
              <BallotHeader>
                {seal ? (
                  <div
                    className="seal"
                    // TODO: Sanitize the SVG content: https://github.com/votingworks/bmd/issues/99
                    dangerouslySetInnerHTML={{ __html: seal }} // eslint-disable-line react/no-danger
                  />
                ) : sealURL ? (
                  <div className="seal">
                    <SealImage src={sealURL} alt="" />
                  </div>
                ) : (
                  <React.Fragment />
                )}
                <Prose>
                  <h2>
                    {isLiveMode
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
                        {isLiveMode
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
                  <h4>
                    {t('To Vote for a Write-In', { lng: locales.primary })}
                  </h4>
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
            {contests.map(
              (contest, i) =>
                i < 999 && (
                  <Contest
                    key={contest.id}
                    data-contest
                    data-contest-title={contest.title}
                  >
                    <Prose>
                      <Text small bold>
                        {dualPhraseWithSlash(
                          contest.section,
                          localeContests && localeContests[i].section,
                          { normal: true }
                        )}
                      </Text>
                      <h3>
                        {dualPhraseWithSlash(
                          contest.title,
                          localeContests && localeContests[i].title,
                          { normal: true }
                        )}
                      </h3>
                      {contest.type === 'candidate' && (
                        <React.Fragment>
                          <Text bold>
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
                            vote={votes[contest.id] as CandidateVote}
                            locales={locales}
                          />
                        </React.Fragment>
                      )}
                      {contest.type === 'yesno' && (
                        <React.Fragment>
                          <p>
                            <Trans
                              i18nKey="voteYesOrNo"
                              tOptions={{ lng: locales.primary }}
                            >
                              Vote <strong>Yes</strong> or <strong>No</strong>
                            </Trans>
                            {locales.secondary && (
                              <React.Fragment>
                                {' / '}
                                <Trans
                                  i18nKey="voteYesOrNo"
                                  tOptions={{ lng: locales.secondary }}
                                >
                                  Vote <strong>Yes</strong> or{' '}
                                  <strong>No</strong>
                                </Trans>
                              </React.Fragment>
                            )}
                          </p>
                          <Text
                            small
                            preLine
                            dangerouslySetInnerHTML={{
                              __html: contest.description,
                            }}
                          />
                          {localeContests && (
                            <Text
                              small
                              preLine
                              dangerouslySetInnerHTML={{
                                __html: (localeContests[i] as YesNoContest)
                                  .description,
                              }}
                            />
                          )}
                          {['Yes', 'No'].map((answer) => (
                            <Text key={answer} bold noWrap>
                              <BubbleMark
                                checked={
                                  votes[contest.id] &&
                                  votes[contest.id]![0] === answer.toLowerCase()
                                }
                              >
                                <span>{dualLanguageWithSlash(answer)}</span>
                              </BubbleMark>
                            </Text>
                          ))}
                        </React.Fragment>
                      )}
                    </Prose>
                  </Contest>
                )
            )}
            <ColumnFooter>
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
            </ColumnFooter>
          </BallotColumns>
        </Content>
      </Ballot>
    </React.Fragment>
  )
}

export default HandMarkedPaperBallot
