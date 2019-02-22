import React from 'react'
import { Link, RouteComponentProps } from 'react-router-dom'
import styled from 'styled-components'

import Button from '../components/Button'
import ButtonBar from '../components/ButtonBar'
import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Modal from '../components/Modal'
import Prose from '../components/Prose'
import { Text } from '../components/Typography'
import BallotContext from '../contexts/ballotContext'

const Header = styled.div`
  margin: 1rem 0;
`

const Table = styled.table`
  width: 100%;
  max-width: 66ch;
  text-align: left;
  border-bottom: 1px solid lightGrey;
`
interface TableCellProps {
  border?: boolean
}
const TableCell = styled.td`
  width: 50%;
  padding: 0.5rem 0.25rem;
  border-top: ${({ border = false }: TableCellProps) =>
    border ? '1px solid lightGrey' : 'none'};
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
    return (
      <React.Fragment>
        <Main>
          <MainChild>
            <Header>
              <Prose>
                <h1>Official Ballot</h1>
                <p className="no-print">
                  Please review your ballot. Confirm your votes by selecting the
                  “Print Ballot” button.
                </p>
              </Prose>
            </Header>
            <Table>
              <caption className="no-print visually-hidden">
                <p>Summary of your votes.</p>
              </caption>
              <thead className="no-print">
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
                  {({ contests, votes }) =>
                    contests.map(contest => {
                      const candidateName = votes[contest.id]
                      const vote = candidateName || (
                        <Text as="span" muted>
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
                            <small className="no-print">
                              <Link to={`/contests/${contest.id}`}>change</Link>
                            </small>
                          </TableCell>
                        </tr>
                      )
                    })
                  }
                </BallotContext.Consumer>
              </tbody>
            </Table>
          </MainChild>
        </Main>
        <ButtonBar secondary>
          <Button autoFocus primary onClick={this.showConfirm}>
            Print Ballot
          </Button>
          <LinkButton goBack>Back</LinkButton>
          <div />
          <div />
        </ButtonBar>
        <Modal
          isOpen={this.state.isAlert}
          content={
            <Prose>
              <Text>Are you finished voting?</Text>
            </Prose>
          }
          actions={
            <>
              <Button primary onClick={window.print}>
                Yes, I‘m finished. Print my ballot.
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
