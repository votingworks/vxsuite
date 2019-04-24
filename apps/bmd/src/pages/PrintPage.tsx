import React from 'react'
import { RouteComponentProps } from 'react-router-dom'
import styled from 'styled-components'

import {
  Candidate,
  CandidateContest,
  CandidateVote,
  OptionalYesNoVote,
  YesNoContest,
  YesNoVote,
} from '../config/types'

import { Barcode } from '../assets/BarCodes'
import Button from '../components/Button'
import ButtonBar from '../components/ButtonBar'
import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Modal from '../components/Modal'
import Prose from '../components/Prose'
import Text from '../components/Text'
import GLOBALS from '../config/globals'
import BallotContext from '../contexts/ballotContext'

const Ballot = styled.section`
  display: none;
  @media print {
    display: flex;
  }
  flex-direction: column;
  margin: 0;
  min-height: 11in;
  padding: 0.5in;
  background: white;
`
const Header = styled.div`
  display: flex;
  flex-direction: row;
  margin-bottom: 1rem;
  align-items: center;
  text-align: left;
  & > .seal {
    align-self: flex-start;
    width: 7rem;
    margin: 0;
  }
  & h2 {
    margin-bottom: 0;
  }
  & h3 {
    margin-top: 0;
  }
  & > .ballot-header-content {
    flex: 1;
    margin-left: 1rem;
    max-width: 100%;
  }
`
const BarCodeContainer = styled.div`
  margin: 1rem 0 -0.75rem;
  width: 50%;
`
const Content = styled.div`
  flex: 1;
`
const BallotSelections = styled.div`
  columns: 2;
  column-gap: 2rem;
  border-top: 0.01rem solid black;
`
const Contest = styled.div`
  break-inside: avoid;
  padding: 0.5rem 0;
  border-bottom: 0.01rem solid black;
`
const ContestProse = styled(Prose)`
  & > h3 {
    font-size: ${2 / 3}rem;
    font-weight: normal;
  }
  & > p {
    font-size: ${2 / 3}rem;
  }
`
const NoSelection = () => (
  <Text bold muted>
    [no selection]
  </Text>
)

const CandidateContestResult = ({
  contest,
  vote = [],
}: {
  contest: CandidateContest
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
          {candidate.party && `/ ${candidate.party}`}
          {candidate.isWriteIn && `(write-in)`}
        </Text>
      ))}
      {!!remainingChoices && (
        <Text bold muted>
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
      {GLOBALS.YES_NO_VOTES[props.vote]}{' '}
      {!!props.contest.shortTitle && `on ${props.contest.shortTitle}`}
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
  public render() {
    const {
      seal,
      title,
      county,
      state,
      date,
      bmdConfig,
    } = this.context.election
    const { showHelpPage, showSettingsPage } = bmdConfig
    return (
      <React.Fragment>
        <Main>
          <MainChild>
            <Prose className="no-print">
              <h1 aria-label={`Print your ballot.`}>Print your ballot</h1>
              <p>Ready to print ballot.</p>
            </Prose>
            <Ballot aria-hidden="true">
              <Header>
                <div
                  className="seal"
                  dangerouslySetInnerHTML={{ __html: seal }}
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
              </Header>
              <Content>
                <BallotSelections>
                  <BallotContext.Consumer>
                    {({ election, votes }) =>
                      election!.contests.map(contest => (
                        <Contest key={contest.id}>
                          <ContestProse compact>
                            <h3>
                              {contest.section}, {contest.title}
                            </h3>
                            {contest.type === 'candidate' && (
                              <CandidateContestResult
                                contest={contest}
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
                      ))
                    }
                  </BallotContext.Consumer>
                </BallotSelections>
              </Content>
              <BarCodeContainer>
                <Barcode />
              </BarCodeContainer>
            </Ballot>
          </MainChild>
        </Main>
        <ButtonBar>
          <Button primary onClick={this.showConfirm}>
            Print Ballot
          </Button>
          <LinkButton goBack id="previous">
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
              <Button primary onClick={window.print}>
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
