import React from 'react'
import { RouteComponentProps } from 'react-router-dom'
import styled from 'styled-components'
import QRCode from '../components/QRCode'
import { findPartyById } from '../utils/find'

import {
  Candidate,
  CandidateContest,
  CandidateVote,
  Contests,
  OptionalYesNoVote,
  Parties,
  YesNoContest,
  YesNoVote,
} from '../config/types'

import Button from '../components/Button'
import ButtonBar from '../components/ButtonBar'
import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Modal from '../components/Modal'
import Prose from '../components/Prose'
import Text from '../components/Text'
import GLOBALS from '../config/globals'
import BallotContext from '../contexts/ballotContext'

const Header = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  border-bottom: 0.2rem solid #000000;
  height: 1.15in;
  & > .seal {
    margin: 0.25rem 0;
    width: 1in;
  }
  & h2 {
    margin-bottom: 0;
  }
  & h3 {
    margin-top: 0;
  }
  & > .ballot-header-content {
    flex: 1;
    margin: 0 1rem;
    max-width: 100%;
  }
`
const QRCodeContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-self: flex-end;
  border: 0.2rem solid #000000;
  border-bottom: 0;
  max-width: 50%;
  padding: 0.25rem;
  & > div:first-child {
    margin-right: 0.25rem;
    width: 1in;
  }
  & > div:last-child {
    display: flex;
    flex: 1;
    & > div {
      display: flex;
      flex: 1;
      flex-direction: column;
      align-self: stretch;
      justify-content: space-between;
      font-size: 0.8rem;
      & strong {
        font-size: 1rem;
        word-break: break-word;
      }
    }
  }
`
const Content = styled.div`
  flex: 1;
`
const BallotSelections = styled.div`
  columns: 2;
  column-gap: 2rem;
`
const Contest = styled.div`
  border-bottom: 0.01rem solid #000000;
  padding: 0.5rem 0;
  break-inside: avoid;
  page-break-inside: avoid;
`
const ContestProse = styled(Prose)`
  & > h3 {
    font-size: 0.875em;
    font-weight: 400;
  }
`
const NoSelection = () => (
  <Text italic muted>
    [no selection]
  </Text>
)

const CandidateContestResult = ({
  contest,
  parties,
  vote = [],
}: {
  contest: CandidateContest
  parties: Parties
  vote: CandidateVote
}) => {
  const remainingChoices = contest.seats - vote.length
  return vote === undefined || vote.length === 0 ? (
    <NoSelection />
  ) : (
    <React.Fragment>
      {vote.map((candidate: Candidate) => (
        <Text bold key={candidate.id} wordBreak>
          <strong>{candidate.name}</strong>{' '}
          {candidate.partyId &&
            `/ ${findPartyById(parties, candidate.partyId)!.name}`}
          {candidate.isWriteIn && `(write-in)`}
        </Text>
      ))}
      {!!remainingChoices && (
        <Text italic muted>
          [no selection for {remainingChoices} of {contest.seats} choices]
        </Text>
      )}
    </React.Fragment>
  )
}

const YesNoContestResult = (props: {
  contest: YesNoContest
  vote: OptionalYesNoVote
}) =>
  props.vote ? (
    <Text bold wordBreak>
      <strong>
        {GLOBALS.YES_NO_VOTES[props.vote]}{' '}
        {!!props.contest.shortTitle && `on ${props.contest.shortTitle}`}
      </strong>
    </Text>
  ) : (
    <NoSelection />
  )

interface State {
  showConfirmModal: boolean
}

class SummaryPage extends React.Component<RouteComponentProps, State> {
  public static contextType = BallotContext
  public state: State = {
    showConfirmModal: false,
  }
  public componentDidMount = () => {
    window.addEventListener('afterprint', this.resetBallot)
  }
  public componentWillUnmount = () => {
    window.removeEventListener('afterprint', this.resetBallot)
  }
  public resetBallot = () => {
    this.context.resetBallot('/cast')
  }
  public hideConfirm = () => {
    this.setState({ showConfirmModal: false })
  }
  public showConfirm = () => {
    this.setState({ showConfirmModal: true })
  }
  public print = () => {
    this.context.markVoterCardUsed().then((success: boolean) => {
      if (success) {
        window.print()
      }
    })
  }
  public render() {
    const {
      ballotStyleId,
      contests,
      election: { seal, parties, title, county, state, date, bmdConfig },
      precinctId,
      votes,
    } = this.context
    const { showHelpPage, showSettingsPage } = bmdConfig

    const encodedVotes: string = (contests as Contests)
      .map(contest => {
        if (!votes[contest.id]) {
          return ''
        }

        if (contest.type === 'yesno') {
          if (votes[contest.id] === 'yes') {
            return '1'
          } else {
            return '0'
          }
        }

        const candidateIDs = (contest as CandidateContest).candidates.map(
          (c: Candidate) => c.id
        )
        return votes[contest.id]
          .map((c: Candidate) => candidateIDs.indexOf(c.id))
          .join(',')
      })
      .join('/')

    return (
      <React.Fragment>
        <Main>
          <MainChild>
            <Prose className="no-print">
              <h1 aria-label="Print your ballot.">Print your ballot</h1>
              <p>Ready to print ballot.</p>
            </Prose>
            <div aria-hidden="true" className="print-only">
              <Header>
                <div
                  className="seal"
                  // TODO: Sanitize the SVG content: https://github.com/votingworks/bmd/issues/99
                  dangerouslySetInnerHTML={{ __html: seal }} // eslint-disable-line react/no-danger
                />
                <Prose className="ballot-header-content">
                  <h2>Official Ballot</h2>
                  <h3>{title}</h3>
                  <p>
                    {date}
                    <br />
                    {county}, {state}
                  </p>
                </Prose>
                <QRCodeContainer>
                  <QRCode
                    value={`${ballotStyleId}.${precinctId}.${encodedVotes}`}
                  />
                  <div>
                    <div>
                      <div>
                        <div>Ballot Style</div>
                        <strong>{ballotStyleId}</strong>
                      </div>
                      <div>
                        <div>Precinct Number</div>
                        <strong>{precinctId}</strong>
                      </div>
                      <div>
                        <div>Serial Number</div>
                        <strong>7zA5s434g2sj12</strong>
                      </div>
                    </div>
                  </div>
                </QRCodeContainer>
              </Header>
              <Content>
                <BallotSelections>
                  {(contests as Contests).map(contest => (
                    <Contest key={contest.id}>
                      <ContestProse compact>
                        <h3>{contest.title}</h3>
                        {contest.type === 'candidate' && (
                          <CandidateContestResult
                            contest={contest}
                            parties={parties}
                            vote={votes[contest.id] as CandidateVote}
                          />
                        )}
                        {contest.type === 'yesno' && (
                          <YesNoContestResult
                            contest={contest}
                            vote={votes[contest.id] as YesNoVote}
                          />
                        )}
                      </ContestProse>
                    </Contest>
                  ))}
                </BallotSelections>
              </Content>
            </div>
          </MainChild>
        </Main>
        <ButtonBar>
          <Button primary onClick={this.showConfirm}>
            Print Ballot
          </Button>
          <LinkButton to="/review" id="previous">
            Back
          </LinkButton>
          <div />
          <div />
        </ButtonBar>
        <ButtonBar secondary separatePrimaryButton>
          <div />
          {showHelpPage && <LinkButton to="/help">Help</LinkButton>}
          {showSettingsPage && <LinkButton to="/settings">Settings</LinkButton>}
        </ButtonBar>
        <Modal
          isOpen={this.state.showConfirmModal}
          centerContent
          content={
            <Prose>
              <Text center>
                You may not make any changes after you print your ballot.
              </Text>
              <Text center>Do you want to print your ballot?</Text>
            </Prose>
          }
          actions={
            <>
              <Button
                primary
                onClick={() => {
                  this.print()
                }}
              >
                Yes, print my ballot.
              </Button>
              <Button onClick={this.hideConfirm}>No, go back.</Button>
            </>
          }
        />
      </React.Fragment>
    )
  }
}

export default SummaryPage
