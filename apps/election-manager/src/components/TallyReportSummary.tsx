import React from 'react'
import styled from 'styled-components'

import { Dictionary, Election } from '@votingworks/types'

import * as format from '../utils/format'
import { getLabelForVotingMethod } from '../utils/votingMethod'
import { VotingMethod } from '../config/types'

import Table, { TD } from './Table'

const BallotSummary = styled.div`
  margin-bottom: 1em;
  border: 1px solid rgb(194, 200, 203);
  border-width: 0 1px;
  h3 {
    margin: 0;
    background: rgb(194, 200, 203);
    padding: 0.25rem 0.5rem;
  }
`

interface Props {
  election: Election
  totalBallotCount: number
  ballotCountsByVotingMethod: Dictionary<number>
}

const TallyReportSummary: React.FC<Props> = ({
  totalBallotCount,
  ballotCountsByVotingMethod,
}) => {
  return (
    <BallotSummary>
      <h3>Ballots by Voting Method</h3>
      <Table data-testid="voting-method-table">
        <tbody>
          {Object.keys(ballotCountsByVotingMethod).map((votingMethod) => {
            // Hide the "Other" row when it does not apply to any CVRs
            if (
              votingMethod === VotingMethod.Unknown &&
              ballotCountsByVotingMethod[votingMethod] === 0
            ) {
              return null
            }
            return (
              <tr key={votingMethod} data-testid={votingMethod}>
                <TD>{getLabelForVotingMethod(votingMethod as VotingMethod)}</TD>
                <TD textAlign="right">
                  {format.count(ballotCountsByVotingMethod[votingMethod] ?? 0)}
                </TD>
              </tr>
            )
          })}
          <tr data-testid="total">
            <TD>
              <strong>Total Ballots Cast</strong>
            </TD>
            <TD textAlign="right">
              <strong>{format.count(totalBallotCount)}</strong>
            </TD>
          </tr>
        </tbody>
      </Table>
    </BallotSummary>
  )
}

export default TallyReportSummary
