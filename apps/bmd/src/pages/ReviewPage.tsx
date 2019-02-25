import React, { SyntheticEvent } from 'react'
import { Link, RouteComponentProps } from 'react-router-dom'
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

const Table = styled.table`
  width: 100%;
  max-width: 66ch;
  text-align: left;
  border-bottom: 1px solid lightGrey;
  @media print {
    max-width: 100%;
  }
`
interface TableCellProps {
  border?: boolean
}
const TableCell = styled.td`
  width: 50%;
  padding: 0.5rem 0.25rem;
  border-top: ${({ border = false }: TableCellProps) =>
    border ? '1px solid lightGrey' : 'none'};
  font-weight: normal;
  line-height: 1.2;
  vertical-align: top;
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
              <h1 className="no-print">Review Your Selections</h1>
              <p className="no-print">
                Confirm your votes by printing your ballot.
              </p>
            </Prose>
            <Ballot>
              <Header>
                <div
                  className="seal"
                  dangerouslySetInnerHTML={{ __html: seal }}
                />
                <Prose className="ballot-header-content">
                  <h2>Official Ballot</h2>
                  <h3>{title}</h3>
                  <p>
                    {county}, {state}
                    <br />
                    {date}
                  </p>
                </Prose>
              </Header>
              <Content>
                <Table>
                  <caption className="no-print visually-hidden">
                    <p>Summary of your votes.</p>
                  </caption>
                  <thead>
                    <tr>
                      <TableCell as="th" scope="col">
                        Contest
                      </TableCell>
                      <TableCell as="th" scope="col">
                        Vote
                      </TableCell>
                    </tr>
                  </thead>
                  <tbody>
                    <BallotContext.Consumer>
                      {({ election, votes }) =>
                        election!.contests.map(contest => {
                          const candidateName = votes[contest.id]
                          const vote = candidateName ? (
                            <strong>{candidateName}</strong>
                          ) : (
                            <Text as="strong" muted>
                              no selection
                            </Text>
                          )
                          return (
                            <tr key={contest.id}>
                              <TableCell as="th" border>
                                {contest.title}{' '}
                              </TableCell>
                              <TableCell border>
                                {vote}{' '}
                                <LinkButton
                                  to={`/contests/${contest.id}`}
                                  className="no-print"
                                  inTableMargins
                                >
                                  Change
                                </LinkButton>
                              </TableCell>
                            </tr>
                          )
                        })
                      }
                    </BallotContext.Consumer>
                  </tbody>
                </Table>
              </Content>
              <BarCodeContainer>
                <Barcode />
              </BarCodeContainer>
            </Ballot>
          </MainChild>
        </Main>
        <ButtonBar separatePrimaryButton>
          <Button autoFocus primary onClick={this.showConfirm}>
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
