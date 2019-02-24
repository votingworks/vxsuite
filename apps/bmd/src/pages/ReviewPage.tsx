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
import Seal from '../components/Seal'
import { Text } from '../components/Typography'
import BallotContext from '../contexts/ballotContext'

const Ballot = styled.section`
  display: flex;
  flex-direction: column;
  min-height: 11in;
  margin-top: 2rem;
  padding: 2rem;
  background: white;
  @media print {
    margin: 0;
    padding: 0;
  }
`

const Header = styled.div`
  display: flex;
  margin-bottom: 1rem;
  align-items: center;
  & h2 {
    margin-bottom: 0;
  }
  & h3 {
    margin-top: 0;
  }
  & > div:nth-child(1) {
    width: 175px;
    align-self: flex-start;
  }
  & > div:nth-child(2) {
    flex: 1;
    margin: 0 1rem;
  }
`

const BarCodeContainer = styled.div`
  width: 50%;
  margin: 1rem 0 -0.75rem;
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
                <Seal dangerouslySetInnerHTML={{ __html: seal }} />
                <Prose>
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
                          const onClick = () => {
                            this.props.history.push(`/contests/${contest.id}`)
                          }
                          const onClickLink = (event: SyntheticEvent) => {
                            event.preventDefault()
                          }
                          return (
                            <tr key={contest.id} onClick={onClick}>
                              <TableCell as="th" border>
                                {contest.title}{' '}
                              </TableCell>
                              <TableCell border>
                                {vote}{' '}
                                <small className="no-print">
                                  <Link
                                    to={`/contests/${contest.id}`}
                                    onClick={onClickLink}
                                  >
                                    change
                                  </Link>
                                </small>
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
