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

import { DEFAULT_LOCALE } from '../config/globals'

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
  lng?: string,
  separator?: string
) => (key: string, options?: StringMap) => {
  const enTranslation = t(key, {
    ...options,
    lng: DEFAULT_LOCALE,
  })
  if (!lng) {
    return enTranslation
  }
  const dualTranslation = t(key, {
    ...options,
    lng,
  })
  if (separator === 'break') {
    return dualPhraseWithBreak(enTranslation, dualTranslation)
  }
  return dualPhraseWithSlash(enTranslation, dualTranslation, {
    separator,
    normal: true,
  })
}

const qrCodeTargetClassName = 'qr-code-target'

interface PagedJSPage {
  element: {
    dataset: {
      pageNumber: string
    }
  }
  id: string
}
class PagedQRCodeInjector extends Handler {
  afterRendered(pages: PagedJSPage[]) {
    pages.forEach((page) => {
      const { pageNumber } = page.element.dataset
      const qrCodeTarget = document
        .getElementById(page.id)
        ?.getElementsByClassName(qrCodeTargetClassName)[0]
      const {
        precinctId = '',
        ballotStyleId = '',
        isLiveMode = '',
        secondaryLocaleCode = '',
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
              primaryLocaleCode: DEFAULT_LOCALE,
              secondaryLocaleCode,
            })}
          />,
          qrCodeTarget
        )
      }
    })
  }
}
registerHandlers(PagedQRCodeInjector)

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
  .pagedjs_left_page & {
    margin-left: 0.66in;
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
  /* column-fill: auto; */
  /* height: 10in; */
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
  background: #eeeeee;
  padding: 0.125in;
  img {
    float: right;
    width: 45%;
    margin: 0.05in 0 0.05in 0.05in;
    background: #ffffff;
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
  page-break-inside: avoid;
  margin: 0.5em 0 !important;
  &:last-child {
    margin-bottom: 0 !important;
  }
`

const ballotMetadata = ({
  isLiveMode,
  precinctId,
  ballotStyleId,
  pageNumber,
  pageCount,
  primaryLocaleCode,
  secondaryLocaleCode,
}: {
  isLiveMode: boolean
  precinctId: Precinct['id']
  ballotStyleId: BallotStyle['id']
  pageNumber: number
  pageCount: number
  primaryLocaleCode: string
  secondaryLocaleCode: string
}): string => {
  const params = new URLSearchParams([
    ['t', `${!isLiveMode ? 't' : '_'}`],
    ['pr', precinctId],
    ['bs', ballotStyleId],
    ['l1', primaryLocaleCode],
    ['l2', secondaryLocaleCode],
    ['p', `${pageNumber}-${pageCount}`],
  ])
  return new URL(`https://ballot.page/?${params}`).toString()
}

const CandidateContestChoices = ({
  contest,
  secondaryLocaleCode,
  parties,
  vote = [],
}: {
  contest: CandidateContest
  secondaryLocaleCode?: string
  parties: Parties
  vote: CandidateVote
}) => {
  const { t } = useTranslation()
  const writeInCandidates = vote.filter((c) => c.isWriteIn)
  const remainingChoices = [...Array(contest.seats - vote.length).keys()]
  const dualLanguageWithSlash = dualLanguageComposer(t, secondaryLocaleCode)
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
  secondaryLocaleCode?: string
  votes?: VotesDict
  onRendered?(props: Omit<Props, 'onRendered'>): void
}

const HandMarkedPaperBallot = ({
  ballotStyleId,
  election,
  isLiveMode = true,
  precinctId,
  secondaryLocaleCode = '',
  votes = {},
  onRendered,
}: Props) => {
  const { t, i18n } = useTranslation()
  const { printBallotRef } = useContext(AppContext)
  const { county, date, seal, sealURL, state, parties, title } = election
  const localeElection: OptionalElection = secondaryLocaleCode
    ? withLocale(election, secondaryLocaleCode)
    : undefined
  i18n.addResources(DEFAULT_LOCALE, 'translation', election.ballotStrings)
  if (localeElection) {
    i18n.addResources(
      secondaryLocaleCode,
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

  useLayoutEffect(() => {
    const printBallot = printBallotRef?.current

    if (!printBallot) {
      return
    }

    const ballotStylesheets = [
      `/ballot/layout-${secondaryLocaleCode ? 'dual' : 'single'}-language.css`,
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
      onRendered?.({ ballotStyleId, election, isLiveMode, precinctId, votes })
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
    secondaryLocaleCode,
    votes,
  ])

  // eslint-disable-next-line no-restricted-syntax
  const ballotRef = useRef<HTMLDivElement>(null)

  const dualLanguageWithSlash = dualLanguageComposer(t, secondaryLocaleCode)
  const dualLanguageWithBreak = dualLanguageComposer(
    t,
    secondaryLocaleCode,
    'break'
  )

  return (
    <React.Fragment>
      <Ballot aria-hidden data-ballot ref={ballotRef}>
        <div className="ballot-footer">
          <PageFooter>
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
                    <span className="page-number"></span>
                    <span>/</span>
                    <span className="total-pages"></span>
                  </Text>
                  <Text small left as="div">
                    {dualLanguageWithBreak('Pages')}
                  </Text>
                </div>
              </PageFooterRow>
              <PageFooterRow>
                <div>
                  <Text small={!!secondaryLocaleCode} left as="div">
                    {ballotStyle.partyId &&
                    primaryPartyName &&
                    localePrimaryPartyName
                      ? dualPhraseWithBreak(
                          `${ballotStyle.partyId && primaryPartyName} ${title}`,
                          localeElection &&
                            t('{{primaryPartyName}} {{electionTitle}}', {
                              lng: secondaryLocaleCode,
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
                  <Text small={!!secondaryLocaleCode} center as="div">
                    {dualPhraseWithBreak(
                      `${county.name}, ${state}`,
                      localeElection &&
                        `${localeElection.county.name}, ${localeElection.state}`
                    )}
                  </Text>
                </div>
                <div>
                  <Text small={!!secondaryLocaleCode} right as="div">
                    {secondaryLocaleCode ? (
                      <React.Fragment>
                        <strong>{localeDateLong(date, DEFAULT_LOCALE)}</strong>
                        <br />
                        {localeDateLong(date, secondaryLocaleCode)}
                      </React.Fragment>
                    ) : (
                      <React.Fragment>
                        {localeDateLong(date, DEFAULT_LOCALE)}
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
              data-second-locale-code={secondaryLocaleCode}
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
                      ? t('Official Ballot', { lng: DEFAULT_LOCALE })
                      : t('TEST BALLOT', { lng: DEFAULT_LOCALE })}
                  </h2>
                  <h3>
                    {ballotStyle.partyId && primaryPartyName} {title}
                  </h3>
                  <p>
                    {state}
                    <br />
                    {county.name}
                    <br />
                    {localeDateLong(date, DEFAULT_LOCALE)}
                  </p>
                  {localeElection && (
                    <p>
                      <strong>
                        {isLiveMode
                          ? t('Official Ballot', { lng: secondaryLocaleCode })
                          : t('TEST BALLOT', {
                              lng: secondaryLocaleCode,
                            })}
                      </strong>
                      <br />
                      <strong>
                        {ballotStyle.partyId && primaryPartyName
                          ? t('{{primaryPartyName}} {{electionTitle}}', {
                              lng: secondaryLocaleCode,
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
                      {localeDateLong(date, secondaryLocaleCode)}
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
                  <h4>{t('Instructions', { lng: DEFAULT_LOCALE })}</h4>
                  <Text small>
                    {t(
                      'To vote, use a black pen to completely fill in the oval to the left of your choice.',
                      { lng: DEFAULT_LOCALE }
                    )}
                  </Text>
                  <h4>
                    {t('To Vote for a Write-In', { lng: DEFAULT_LOCALE })}
                  </h4>
                  <Text small>
                    <img src="/ballot/instructions-write-in.svg" alt="" />
                    {t(
                      'To vote for a person not on the ballot, completely fill in the oval to the left of the “write-in” line and print the person’s name on the line.',
                      { lng: DEFAULT_LOCALE }
                    )}
                  </Text>
                  <h4>{t('To correct a mistake', { lng: DEFAULT_LOCALE })}</h4>
                  <Text small>
                    {t(
                      'To make a correction, please ask for a replacement ballot. Any marks other than filled ovals may cause your ballot not to be counted.',
                      { lng: DEFAULT_LOCALE }
                    )}
                  </Text>
                  {secondaryLocaleCode && (
                    <React.Fragment>
                      <HorizontalRule />
                      <img
                        src="/ballot/instructions-fill-oval.svg"
                        alt=""
                        className="ignore-prose"
                      />
                      <h4>{t('Instructions', { lng: secondaryLocaleCode })}</h4>
                      <Text small>
                        {t(
                          'To vote, use a black pen to completely fill in the oval to the left of your choice.',
                          { lng: secondaryLocaleCode }
                        )}
                      </Text>
                      <h4>
                        {t('To Vote for a Write-In', {
                          lng: secondaryLocaleCode,
                        })}
                      </h4>
                      <Text small>
                        <img src="/ballot/instructions-write-in.svg" alt="" />
                        {t(
                          'To vote for a person not on the ballot, completely fill in the oval to the left of the “write-in” line and print the person’s name on the line.',
                          { lng: secondaryLocaleCode }
                        )}
                      </Text>
                      <h4>
                        {t('To correct a mistake', {
                          lng: secondaryLocaleCode,
                        })}
                      </h4>
                      <Text small>
                        {t(
                          'To make a correction, please ask for a replacement ballot. Any marks other than filled ovals may cause your ballot not to be counted.',
                          { lng: secondaryLocaleCode }
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
                            secondaryLocaleCode={secondaryLocaleCode}
                          />
                        </React.Fragment>
                      )}
                      {contest.type === 'yesno' && (
                        <React.Fragment>
                          <p>
                            <Trans
                              i18nKey="voteYesOrNo"
                              tOptions={{ lng: DEFAULT_LOCALE }}
                            >
                              Vote <strong>Yes</strong> or <strong>No</strong>
                            </Trans>
                            {secondaryLocaleCode && (
                              <React.Fragment>
                                {' / '}
                                <Trans
                                  i18nKey="voteYesOrNo"
                                  tOptions={{ lng: secondaryLocaleCode }}
                                >
                                  Vote <strong>Yes</strong> or{' '}
                                  <strong>No</strong>
                                </Trans>
                              </React.Fragment>
                            )}
                          </p>
                          <Text small>{contest.description}</Text>
                          {localeContests && (
                            <Text small>
                              {(localeContests[i] as YesNoContest).description}
                            </Text>
                          )}
                          {['Yes', 'No'].map((answer) => (
                            <Text key={answer} bold noWrap>
                              <BubbleMark
                                checked={
                                  votes[contest.id] === answer.toLowerCase()
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
