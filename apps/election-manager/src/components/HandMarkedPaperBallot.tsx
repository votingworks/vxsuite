import { strict as assert } from 'assert'
import React, { useLayoutEffect, useRef, useContext } from 'react'
import ReactDOM from 'react-dom'
import styled from 'styled-components'
import DOMPurify from 'dompurify'
import moment from 'moment'
import 'moment/min/locales'
import { fromByteArray } from 'base64-js'
import { Handler, Previewer, registerHandlers } from 'pagedjs'
import { TFunction, StringMap } from 'i18next'
import { useTranslation, Trans } from 'react-i18next'
import {
  AnyContest,
  BallotType,
  Candidate,
  CandidateContest,
  CandidateVote,
  Dictionary,
  Election,
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
} from '@votingworks/types'

import {
  encodeHMPBBallotPageMetadata,
  HMPBBallotPageMetadata,
} from '@votingworks/ballot-encoder'
import AppContext from '../contexts/AppContext'

import findPartyById from '../utils/findPartyById'

import BubbleMark from './BubbleMark'
import WriteInLine from './WriteInLine'
import QRCode from './QRCode'
import Prose from './Prose'
import Text from './Text'
import HorizontalRule from './HorizontalRule'
import { BallotLocale } from '../config/types'
import { ABSENTEE_TINT_COLOR } from '../config/globals'
import { getBallotLayoutPageSize } from '../utils/getBallotLayoutPageSize'

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

const qrCodeTargetClassName = 'qr-code-target'

const BlankPageContent = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
`

type HMPBBallotMetadata = Omit<HMPBBallotPageMetadata, 'pageNumber'>

interface PagedJSPage {
  element: HTMLElement
  id: string
  pagesArea: HTMLElement
}
class PostRenderBallotProcessor extends Handler {
  afterRendered(pages: PagedJSPage[]) {
    // Insert blank page if ballot page count is odd.
    if (pages.length % 2) {
      const pagedjsPages = pages[0].pagesArea
      if (pagedjsPages.lastChild) {
        const newLastPageElement = pagedjsPages.lastChild.cloneNode(
          true
        ) as HTMLElement
        pagedjsPages.appendChild(newLastPageElement)
        pagedjsPages.setAttribute(
          'style',
          `--pagedjs-page-count:${pages.length + 1};`
        )
        newLastPageElement.id = `page-${pages.length + 1}`
        newLastPageElement.classList.remove(
          'pagedjs_first_page',
          'pagedjs_right_page'
        )
        newLastPageElement.classList.add('pagedjs_left_page')
        newLastPageElement.setAttribute(
          'data-page-number',
          `${pages.length + 1}`
        )
        newLastPageElement.setAttribute('data-id', `page-${pages.length + 1}`)
        ReactDOM.render(
          <BlankPageContent>
            <Prose>
              <p>This ballot page is intentionally blank.</p>
            </Prose>
          </BlankPageContent>,
          newLastPageElement.getElementsByClassName('pagedjs_page_content')[0]
        )

        const newPage = {
          ...pages[pages.length - 1],
          element: newLastPageElement,
        }

        pages.push(newPage)
      }
    }

    // Post-process QR codes in footer.
    pages.forEach((page) => {
      const { pageNumber } = page.element.dataset
      const qrCodeTarget = page.element.getElementsByClassName(
        qrCodeTargetClassName
      )[0]
      if (qrCodeTarget && qrCodeTarget instanceof HTMLElement) {
        const election: Election = JSON.parse(
          qrCodeTarget.dataset.election ?? ''
        )
        const {
          electionHash,
          precinctId,
          ballotStyleId,
          isTestMode,
          locales,
          ballotType,
          ballotId,
        }: HMPBBallotMetadata = JSON.parse(qrCodeTarget.dataset.metadata ?? '')

        const encoded = encodeHMPBBallotPageMetadata(election, {
          electionHash: electionHash.substring(0, 20),
          ballotStyleId,
          precinctId,
          locales,
          isTestMode,
          pageNumber: parseInt(pageNumber!, 10),
          ballotType,
          ballotId,
        })

        ReactDOM.render(
          <QRCode level="L" value={fromByteArray(encoded)} />,
          qrCodeTarget
        )
      }
    })
  }
}
registerHandlers(PostRenderBallotProcessor)

const Ballot = styled.div`
  display: none;
`
const SealImage = styled.img`
  max-width: 1in;
`
const Content = styled.div`
  flex: 1;
`
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
`
const AbsenteeFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 0.08in;
  background: ${ABSENTEE_TINT_COLOR};
  width: 1in;
  color: #ffffff;
`
const PageFooter = styled.div`
  display: flex;
  justify-content: flex-end;
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
  margin-left: 0.15in;
  width: 0.55in;
`
const CandidateContestsLayout = styled.div`
  columns: 3;
  column-gap: 1em;
`
const OtherContestsLayout = styled(CandidateContestsLayout)`
  columns: 2;
  break-before: column;
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
export const StyledContest = styled.div`
  margin-bottom: 1em;
  border: 0.2em solid #000000;
  border-top-width: 0.3em;
  padding: 0.5em 1em 1em;
  break-inside: avoid;
  page-break-inside: avoid;
  p + h3 {
    margin-top: -0.6em;
  }
`
interface ContestProps {
  section: React.ReactNode
  title: React.ReactNode
  children: React.ReactNode
}
export const Contest: React.FC<ContestProps> = ({
  section,
  title,
  children,
}) => (
  <StyledContest>
    <Prose>
      <Text small bold>
        {section}
      </Text>
      <h3>{title}</h3>
      {children}
    </Prose>
  </StyledContest>
)
const StyledColumnFooter = styled.div`
  page-break-inside: avoid;
`
const WriteInItem = styled.p`
  margin: 0.5em 0 !important; /* stylelint-disable-line declaration-no-important */
  page-break-inside: avoid;
  &:last-child {
    margin-bottom: 0 !important; /* stylelint-disable-line declaration-no-important */
  }
`

const CandidateDescription = styled.span<{ isSmall?: boolean }>`
  font-size: ${({ isSmall }) => (isSmall ? '0.9em' : undefined)};
`

export interface CandidateContestChoicesProps {
  contest: CandidateContest
  locales: BallotLocale
  parties: Parties
  vote: CandidateVote
}

export const CandidateContestChoices: React.FC<CandidateContestChoicesProps> = ({
  contest,
  locales,
  parties,
  vote = [],
}) => {
  const { t } = useTranslation()
  const writeInCandidates = vote.filter((c) => c.isWriteIn)
  const remainingChoices = [...Array(contest.seats).keys()]
  const dualLanguageWithSlash = dualLanguageComposer(t, locales)
  return (
    <React.Fragment>
      {contest.candidates.map((candidate, _, array) => (
        <Text key={candidate.id} data-candidate>
          <BubbleMark checked={hasVote(vote, candidate.id)}>
            <CandidateDescription isSmall={array.length > 5}>
              <strong data-candidate-name={candidate.name}>
                {candidate.name}
              </strong>
              {candidate.partyId && (
                <React.Fragment>
                  <br />
                  {findPartyById(parties, candidate.partyId)!.name}
                </React.Fragment>
              )}
            </CandidateDescription>
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

function hasVote(vote: Vote | undefined, optionId: string): boolean {
  return (
    vote?.some((choice: Candidate | string) =>
      typeof choice === 'string' ? choice === optionId : choice.id === optionId
    ) ?? false
  )
}

export interface HandMarkedPaperBallotProps {
  ballotStyleId: string
  election: Election
  electionHash: string
  isLiveMode?: boolean
  isAbsenteeMode?: boolean
  precinctId: string
  locales: BallotLocale
  ballotId?: string
  votes?: VotesDict
  onRendered?(props: Omit<HandMarkedPaperBallotProps, 'onRendered'>): void
}

const HandMarkedPaperBallot: React.FC<HandMarkedPaperBallotProps> = ({
  ballotStyleId,
  election,
  electionHash,
  isLiveMode = true,
  isAbsenteeMode = true,
  precinctId,
  locales,
  ballotId,
  votes = {},
  onRendered,
}) => {
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
  assert(ballotStyle)
  const contests = getContests({ ballotStyle, election })
  const candidateContests = contests.filter((c) => c.type === 'candidate')
  const otherContests = contests.filter((c) => c.type !== 'candidate')
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
    )
  const precinct = getPrecinctById({ election, precinctId })!

  const ballotRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!printBallotRef?.current) {
      return
    }

    const ballotStylesheets = [
      `/ballot/ballot-layout-paper-size-${getBallotLayoutPageSize(
        election
      )}.css`,
      '/ballot/ballot.css',
    ]

    ;(async () => {
      await new Previewer().preview(
        ballotRef.current!.innerHTML,
        ballotStylesheets,
        printBallotRef?.current
      )
      onRendered?.({
        ballotStyleId,
        election,
        electionHash,
        isLiveMode,
        precinctId,
        votes,
        locales,
      })
    })()

    return () => {
      if (printBallotRef.current) {
        printBallotRef.current.innerHTML = ''
      }
      document.head
        .querySelectorAll('[data-pagedjs-inserted-styles]')
        .forEach((e) => e.parentNode?.removeChild(e))
    }
  }, [
    ballotStyleId,
    election,
    electionHash,
    isLiveMode,
    onRendered,
    precinctId,
    printBallotRef,
    locales,
    votes,
  ])

  const dualLanguageWithSlash = dualLanguageComposer(t, locales)
  const dualLanguageWithBreak = dualLanguageComposer(t, locales, 'break')

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
  )

  return (
    <Ballot aria-hidden data-ballot ref={ballotRef}>
      <div className="ballot-footer">
        <PageFooter>
          {isAbsenteeMode && (
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
            data-election={JSON.stringify(election)}
            data-metadata={JSON.stringify(
              ((): HMPBBallotMetadata => ({
                electionHash,
                ballotStyleId,
                precinctId,
                locales,
                isTestMode: !isLiveMode,
                ballotType: isAbsenteeMode
                  ? BallotType.Absentee
                  : BallotType.Standard,
                ballotId,
              }))()
            )}
          />
        </PageFooter>
      </div>

      <Content>
        <CandidateContestsLayout>
          <IntroColumn>
            {isAbsenteeMode && (
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
                    __html: DOMPurify.sanitize(seal),
                  }}
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
                  <p>
                    {contest.seats === 1
                      ? dualLanguageWithSlash('Vote for 1', {
                          normal: true,
                        })
                      : dualLanguageWithSlash(
                          'Vote for not more than {{ seats }}',
                          { seats: contest.seats, normal: true }
                        )}
                  </p>
                  <CandidateContestChoices
                    contest={contest}
                    parties={parties}
                    vote={votes[contest.id] as CandidateVote}
                    locales={locales}
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
                        __html: DOMPurify.sanitize(contest.description),
                      }}
                    />
                    {localeContestsById && (
                      <Text
                        small
                        preLine
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(
                            (localeContestsById[contest.id] as YesNoContest)
                              .description
                          ),
                        }}
                      />
                    )}
                    <Text bold noWrap>
                      <BubbleMark checked={hasVote(votes[contest.id], 'yes')}>
                        <span>
                          {dualLanguageWithSlash(
                            contest.yesOption?.label || 'Yes'
                          )}
                        </span>
                      </BubbleMark>
                    </Text>
                    <Text bold noWrap>
                      <BubbleMark checked={hasVote(votes[contest.id], 'no')}>
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
                        __html: DOMPurify.sanitize(contest.description),
                      }}
                    />
                    {localeContestsById && (
                      <Text
                        small
                        preLine
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(
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
                          votes[contest.eitherNeitherContestId],
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
                          votes[contest.eitherNeitherContestId],
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
                          votes[contest.pickOneContestId],
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
                        checked={hasVote(votes[contest.pickOneContestId], 'no')}
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
  )
}

export default HandMarkedPaperBallot
