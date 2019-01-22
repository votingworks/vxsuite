import React, { useContext } from 'react'
import { Link, RouteComponentProps } from 'react-router-dom'
import styled from 'styled-components'

import Article from '../components/Article'
import Button from '../components/Button'
import ButtonBar from '../components/ButtonBar'
import NoPrint from '../components/NoPrint'
import { Text } from '../components/Typography'
import BallotContext from '../contexts/ballotContext'

const Table = styled.table`
  width: 50%;
  text-align: left;
  border-bottom: 1px solid lightGrey;
`
const tableCellBase = `
  padding: 0.5rem 0;
  border-top: 1px solid lightGrey;
`
const TableCellHeader = styled.th`
  ${tableCellBase}
`
const TableCell = styled.td`
  ${tableCellBase}
`

const SummaryPage = (props: RouteComponentProps) => {
  const { contests, resetBallot, votes } = useContext(BallotContext)
  const startOver = () => {
    if (
      Object.keys(votes).length === 0 ||
      window.confirm('Clear all votes and start over?')
    ) {
      resetBallot()
    }
  }
  return (
    <React.Fragment>
      <Article>
        <h1>Official Ballot</h1>
        <p className="no-print">
          Please review your ballot. Confirm your votes by selecting the “Print
          Ballot” button.
        </p>
        <Table>
          <caption className="no-print visually-hidden">
            <p>Summary of your votes.</p>
          </caption>
          <thead className="no-print">
            <tr>
              <TableCellHeader scope="col">Contest</TableCellHeader>
              <TableCellHeader scope="col">Vote</TableCellHeader>
            </tr>
          </thead>
          <tbody>
            {contests.map(contest => {
              const candidate = contest.candidates.find(
                c => c.id === votes[contest.id]
              )
              const vote = candidate ? (
                candidate.name
              ) : (
                <Text muted>no selection</Text>
              )
              return (
                <tr key={contest.id}>
                  <TableCellHeader>{contest.title} </TableCellHeader>
                  <TableCell>
                    {vote}{' '}
                    <NoPrint>
                      <small>
                        <Link to={`/contests/${contest.id}`}>change</Link>
                      </small>
                    </NoPrint>
                  </TableCell>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </Article>
      <ButtonBar>
        <Button autoFocus onClick={window.print}>
          Print Ballot
        </Button>
        <Button onClick={props.history.goBack}>Back</Button>
        <Button onClick={startOver}>New Ballot</Button>
      </ButtonBar>
    </React.Fragment>
  )
}

export default SummaryPage
