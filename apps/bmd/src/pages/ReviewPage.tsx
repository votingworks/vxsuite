import React from 'react'
import { RouteComponentProps } from 'react-router-dom'
import styled from 'styled-components'

import { Barcode } from '../assets/BarCodes'
import Button from '../components/Button'
import ButtonBar from '../components/ButtonBar'
import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Modal from '../components/Modal'
import Prose from '../components/Prose'
import { Text } from '../components/Typography'
import BallotContext from '../contexts/ballotContext'

const Ballot = styled.section`
  display: flex;
  flex-direction: column;
  margin-top: 1rem;
  padding: 1rem 0.5rem;
  background: white;
  @media (min-width: 640px), print {
    margin-top: 2rem;
    padding: 2rem;
  }
  @media print {
    min-height: 11in;
    margin: 0;
    padding: 0.5in;
    font-size: 16px;
  }
`

const Header = styled.div`
  display: flex;
  flex-direction: column;
  margin-bottom: 1rem;
  align-items: center;
  text-align: center;
  @media (min-width: 640px), print {
    text-align: left;
    flex-direction: row;
  }
  & > .seal {
    width: 150px;
    align-self: flex-start;
    margin: 0 auto 0.5rem;
    @media (min-width: 640px), print {
      width: 175px;
      margin: 0;
    }
    @media print {
      width: 1.5in;
      margin: 0;
    }
  }
  & h2 {
    margin-bottom: 0;
  }
  & h3 {
    margin-top: 0;
  }
  & > .ballot-header-content {
    flex: 1;
    @media (min-width: 640px), print {
      margin-left: 1rem;
    }
    @media (min-width: 640px), print {
      max-width: 100%;
    }
  }
`

const BarCodeContainer = styled.div`
  margin: 1rem 0 -0.75rem;
  @media (min-width: 480px), print {
    width: 50%;
  }
`

const Content = styled.div`
  flex: 1;
`

const BallotSelections = styled.dl`
  border-bottom: 1px solid lightgrey;
  padding-bottom: 0.5rem;
`

const ContestHeader = styled.dt`
  margin-top: 0.5rem;
  border-top: 1px solid lightgrey;
  padding-top: 0.5rem;
  & > .change-button {
    float: right;
  }
`

const ContestHeading = styled.span`
  font-size: 0.8rem;
`

const ContestSelection = styled.dd`
  margin: 0;
  word-break: break-word;
`

class SummaryPage extends React.Component<RouteComponentProps> {
  public static contextType = BallotContext
  public state = { isAlert: false }
  public componentDidMount = () => {
    window.addEventListener('afterprint', this.context.resetBallot)
  }
  public componentWillUnmount = () => {
    window.removeEventListener('afterprint', this.context.resetBallot)
  }
  public hideConfirm = () => {
    this.setState({ isAlert: false })
  }
  public showConfirm = () => {
    this.setState({ isAlert: true })
  }
  public render() {
    const { seal, title, county, state, date } = this.context.election
    return (
      <React.Fragment>
        <Main>
          <MainChild>
            <Prose>
              <h1 className="no-print">
                Review Your Selections<span className="visually-hidden">.</span>
              </h1>
              <p className="no-print">
                Confirm your votes by printing your ballot.
              </p>
            </Prose>
            <Ballot>
              <Header>
                <div
                  className="seal"
                  dangerouslySetInnerHTML={{ __html: seal }}
                  aria-label="Election Seal."
                />
                <Prose className="ballot-header-content">
                  <h2>
                    Official Ballot<span className="visually-hidden">.</span>
                  </h2>
                  <h3>
                    {title}
                    <span className="visually-hidden">.</span>
                  </h3>
                  <p>
                    {county}, {state}
                    <span className="visually-hidden">.</span>
                    <br />
                    {date}
                    <span className="visually-hidden">.</span>
                  </p>
                </Prose>
              </Header>
              <Content>
                <BallotSelections>
                  <BallotContext.Consumer>
                    {({ election, votes }) =>
                      election!.contests.map(contest => {
                        const candidate = votes[contest.id]
                        const isWriteInCandidate =
                          !!candidate && candidate.id === 'writeInCandidate'
                        const candidateName = !!candidate ? (
                          <strong>
                            {isWriteInCandidate
                              ? `(${candidate.name})`
                              : candidate.name}
                          </strong>
                        ) : (
                          <Text as="strong" muted>
                            [no selection]
                          </Text>
                        )
                        const candidateParty =
                          !!candidate &&
                          candidate.party &&
                          `/ ${candidate.party}`
                        return (
                          <React.Fragment key={contest.id}>
                            <ContestHeader>
                              <ContestHeading>
                                {contest.title}
                                <span className="visually-hidden">,</span>
                              </ContestHeading>
                              <LinkButton
                                to={`/contests/${contest.id}`}
                                className="no-print change-button"
                                aria-label={`Change ${contest.title}`}
                              >
                                Change
                              </LinkButton>
                              <span className="visually-hidden">,</span>
                            </ContestHeader>
                            <ContestSelection>
                              {candidateName} {candidateParty}
                              <span className="visually-hidden">.</span>
                            </ContestSelection>
                          </React.Fragment>
                        )
                      })
                    }
                  </BallotContext.Consumer>
                </BallotSelections>
              </Content>
              <BarCodeContainer aria-hidden="true">
                <Barcode />
              </BarCodeContainer>
            </Ballot>
          </MainChild>
        </Main>
        <ButtonBar separatePrimaryButton>
          <Button primary onClick={this.showConfirm}>
            Print Ballot
          </Button>
          <LinkButton goBack>Back</LinkButton>
        </ButtonBar>
        <Modal
          isOpen={this.state.isAlert}
          centerContent
          content={
            <Prose>
              <Text center>Are you finished voting?</Text>
            </Prose>
          }
          actions={
            <>
              <Button primary onClick={window.print}>
                Yes, I‘m finished. Print ballot.
              </Button>
              <Button onClick={this.hideConfirm}>No. Go Back.</Button>
            </>
          }
        />
      </React.Fragment>
    )
  }
}

export default SummaryPage
