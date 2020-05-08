import React, { useLayoutEffect, useRef, useContext } from 'react'
import styled from 'styled-components'
import { Previewer } from 'pagedjs'
import {
  CandidateVote,
  YesNoVote,
  OptionalYesNoVote,
  VotesDict,
  CandidateContest,
  YesNoContest,
  Contests,
  Parties,
  Election,
  Precinct,
  BallotStyle,
} from '@votingworks/ballot-encoder'

import * as GLOBALS from '../config/globals'
import AppContext from '../contexts/AppContext'

import { BubbleMark } from './BubbleMark'
import WriteInLine from './WriteInLine'

import { findPartyById } from '../utils/find'
import {
  getBallotStyle,
  getContests,
  getPartyPrimaryAdjectiveFromBallotStyle,
  getPrecinctById,
} from '../utils/election'

import QRCode from './QRCode'
import Prose from './Prose'
import Text from './Text'

const Ballot = styled.div`
  /* display: flex; */
  display: none;
  flex-direction: column;
  width: 8.5in;
  min-height: 11in;
  font-size: 14px;
  page-break-after: always;
  @media screen {
    margin: 0.25in auto;
    outline: 1px solid rgb(255, 0, 255);
    padding: 0.25in 0.25in 0.25in 0.4in;
  }
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
  margin: 0.125in 0 0 0.23in;
`
const PageFooterMain = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: space-between;
  border-top: 1px solid #000000;
  & > div {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    &:first-child {
      padding-top: 0.02em;
    }
  }
  h2 {
    margin: 0;
    font-size: 1.285em; /* 18px */
  }
  sup {
    top: -0.325em;
    font-size: 0.8em;
  }
  strong + sup {
    margin-left: 0.5em;
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
  border: 0.1em solid #000000;
  border-width: 0.1em 0;
  padding: 1em 0;
  img {
    margin-top: 0.3em;
  }
`
const Contest = styled.div`
  margin-bottom: 1em;
  border: 0.05em solid #000000;
  border-top-width: 0.2em;
  padding: 0.5em 1em 1em;
  break-inside: avoid;
  page-break-inside: avoid;
`
const ColumnFooter = styled.div``

const ContestSection = styled.div`
  text-transform: uppercase;
  font-size: 0.85em;
  font-weight: 600;
`

const ballotMetadata = ({
  isLiveMode,
  precinctId,
  ballotStyleId,
  pageNumber,
  pageCount,
}: {
  isLiveMode: boolean
  precinctId: Precinct['id']
  ballotStyleId: BallotStyle['id']
  pageNumber: number
  pageCount: number
}): string => {
  const params = new URLSearchParams([
    ['t', `${!isLiveMode ? 't' : '_'}`],
    ['pr', precinctId],
    ['bs', ballotStyleId],
    ['p', `${pageNumber}-${pageCount}`],
  ])
  return new URL(`https://vx.vote/?${params}`).toString()
}

const CandidateContestChoices = ({
  contest,
  parties,
  vote = [],
}: {
  contest: CandidateContest
  parties: Parties
  vote: CandidateVote
}) => {
  const writeInCandidates = vote.filter((c) => c.isWriteIn)
  const remainingChoices = [...Array(contest.seats - vote.length).keys()]
  return (
    <React.Fragment>
      {contest.candidates.map((candidate) => (
        <Text key={candidate.id} bold data-candidate>
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
              <strong>{candidate.name}</strong> (write-in)
            </span>
          </BubbleMark>
        </Text>
      ))}
      {contest.allowWriteIns &&
        remainingChoices.map((k) => (
          <Text key={k} bold noWrap data-write-in>
            <BubbleMark>
              <strong>write-in:</strong>
              <WriteInLine />
            </BubbleMark>
          </Text>
        ))}
    </React.Fragment>
  )
}

const YesNoContestChoices = (props: {
  contest: YesNoContest
  vote: OptionalYesNoVote
}) => (
  <React.Fragment>
    {['Yes', 'No'].map((answer) => (
      <Text key={answer} bold noWrap>
        <BubbleMark checked={props.vote === answer.toLowerCase()}>
          {GLOBALS.YES_NO_VOTES[answer.toLowerCase() as YesNoVote]}
        </BubbleMark>
      </Text>
    ))}
  </React.Fragment>
)

interface Props {
  ballotStyleId: string
  election: Election
  isLiveMode?: boolean
  precinctId: string
  votes?: VotesDict
  onRendered?(props: Omit<Props, 'onRendered'>): void
}

const HandMarkedPaperBallot = ({
  ballotStyleId,
  election,
  isLiveMode = true,
  precinctId,
  votes = {},
  onRendered,
}: Props) => {
  const { printBallotRef } = useContext(AppContext)
  const { county, date, seal, sealURL, state, parties, title } = election
  const partyPrimaryAdjective = getPartyPrimaryAdjectiveFromBallotStyle({
    ballotStyleId,
    election,
  })
  const ballotStyle = getBallotStyle({ ballotStyleId, election })
  const contests = getContests({ ballotStyle, election })
  // const sections = [...new Set(contests.map(c => c.section))]
  const precinct = getPrecinctById({ election, precinctId })!

  // TODO: The following PagedJS callback needs to be moved to the parent wrapper to run once per page, not per ballot.
  useLayoutEffect(() => {
    const printBallot = printBallotRef?.current

    if (!printBallot) {
      return
    }

    ;(async () => {
      const flow = await new Previewer().preview(
        ballotRef.current!.innerHTML,
        ['/ballot/ballot.css'],
        printBallot
      )
      console.log('preview rendered, total pages', flow.total, { flow })
      onRendered?.({ ballotStyleId, election, isLiveMode, precinctId, votes })
    })()

    return () => {
      // console.log('removing pagedjs ballot')
      printBallot.innerHTML = ''
    }
  }, [
    ballotStyleId,
    precinctId,
    isLiveMode,
    election,
    votes,
    onRendered,
    printBallotRef,
  ])

  // eslint-disable-next-line no-restricted-syntax
  const ballotRef = useRef<HTMLDivElement>(null)

  return (
    <React.Fragment>
      <Ballot aria-hidden data-ballot ref={ballotRef}>
        <div className="ballot-footer">
          <PageFooter>
            <PageFooterMain>
              <Prose maxWidth={false} compact>
                <Text as="h2" normal>
                  <sup>Precinct:</sup> <strong>{precinct.name}</strong>{' '}
                  <sup>Style:</sup> <strong>{ballotStyle.id}</strong>
                </Text>
                <Text as="h2" normal>
                  <strong>
                    Page <span className="ballot-footer-page-number" />
                  </strong>{' '}
                  of <span className="ballot-footer-pages-number" />
                </Text>
              </Prose>
              <Prose maxWidth={false} compact>
                <Text>
                  {isLiveMode ? 'Official Ballot' : 'Unofficial TEST Ballot'}{' '}
                  for
                  {partyPrimaryAdjective} {title}
                </Text>
                <Text>
                  {county.name}, {state}
                </Text>
                <Text>{date}</Text>
              </Prose>
            </PageFooterMain>
            <PageFooterQRCode className="qr-code qr-code-page-1">
              <QRCode
                level="L"
                value={ballotMetadata({
                  isLiveMode,
                  precinctId,
                  ballotStyleId,
                  pageNumber: 1,
                  pageCount: 2,
                })}
              />
            </PageFooterQRCode>
            <PageFooterQRCode className="qr-code qr-code-page-2">
              <QRCode
                level="L"
                value={ballotMetadata({
                  isLiveMode,
                  precinctId,
                  ballotStyleId,
                  pageNumber: 2,
                  pageCount: 2,
                })}
              />
            </PageFooterQRCode>
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
                    {isLiveMode ? 'Official Ballot' : 'Unofficial TEST Ballot'}
                  </h2>
                  <h3>
                    {partyPrimaryAdjective} {title}
                  </h3>
                  <p>
                    {state}
                    <br />
                    {county.name}
                    <br />
                    {date}
                  </p>
                </Prose>
              </BallotHeader>
              <Instructions>
                <Prose>
                  <h3>Instructions</h3>
                  <p>
                    To vote, use a black pen to completely fill in the oval to
                    the left of your choice.
                    <img src="/ballot/instructions-fill-oval.svg" alt="" />
                  </p>
                  <p>
                    To vote for a person not on the ballot, completely fill in
                    the oval to the left of “write-in” and then write the
                    person’s name on the line provided.
                    <img src="/ballot/instructions-write-in.svg" alt="" />
                  </p>
                  <p>
                    To correct any errors or mistakes, please request a
                    replacement ballot. Any marks other than filled ovals may
                    cause your votes not to be counted.
                  </p>
                </Prose>
              </Instructions>
            </IntroColumn>
            {/* {sections.map(section => <Section>
              <h1>{section}</h1>
            </Section>)} */}
            {(contests as Contests).map(
              (contest, i) =>
                i < 999 && (
                  <Contest
                    key={contest.id}
                    data-contest
                    data-contest-title={contest.title}
                  >
                    <Prose>
                      <h3>
                        <ContestSection>{contest.section}</ContestSection>
                        {contest.title}
                      </h3>
                      {contest.type === 'candidate' && (
                        <React.Fragment>
                          <p>
                            {contest.seats === 1
                              ? 'Vote for 1.'
                              : `⚠ Vote for not more than ${contest.seats}.`}
                          </p>
                          <CandidateContestChoices
                            contest={contest}
                            parties={parties}
                            vote={votes[contest.id] as CandidateVote}
                          />
                        </React.Fragment>
                      )}
                      {contest.type === 'yesno' && (
                        <React.Fragment>
                          <p>
                            Vote <strong>Yes</strong> or <strong>No</strong>.
                          </p>
                          <p>{contest.description}</p>
                          <YesNoContestChoices
                            contest={contest}
                            vote={votes[contest.id] as YesNoVote}
                          />
                        </React.Fragment>
                      )}
                    </Prose>
                  </Contest>
                )
            )}
            <ColumnFooter>
              <Prose>
                {/* <p>Continue voting on the next page. →</p> */}
                <h3>Thank you for voting.</h3>
                <p>
                  Review your ballot before casting it. You may request a
                  replacement ballot to correct any errors or mistakes.
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
