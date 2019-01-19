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
const tableCellStyle = `
  padding: 0.5rem 0;
  border-top: 1px solid lightGrey;
`
const TableHead = styled.th`
  ${tableCellStyle}
`
const TableData = styled.td`
  ${tableCellStyle}
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
      <ButtonBar
        leftContent={<Button onClick={props.history.goBack}>Back</Button>}
        centerContent={<Button onClick={startOver}>New Ballot</Button>}
        rightContent={<Button onClick={window.print}>Print</Button>}
      />
      <Article>
        <h1>Official Ballot</h1>
        <Table>
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
                  <TableHead>{contest.title} </TableHead>
                  <TableData>
                    {vote}{' '}
                    <NoPrint>
                      <small>
                        <Link to={`/contests/${contest.id}`}>change</Link>
                      </small>
                    </NoPrint>
                  </TableData>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </Article>
    </React.Fragment>
  )
}

export default SummaryPage
