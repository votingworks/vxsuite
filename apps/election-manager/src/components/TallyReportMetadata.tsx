import React from 'react'

import { Dictionary, Election } from '@votingworks/types'

import * as format from '../utils/format'
import {
  localeWeedkayAndDate,
  localeLongDateAndTime,
} from '../utils/IntlDateTimeFormats'
import { getLabelForVotingMethod } from '../utils/votingMethod'
import { VotingMethod } from '../config/types'

import Text from './Text'
import Table, { TD } from './Table'
import { Contest } from './ContestTally'

interface Props {
  election: Election
  generatedAtTime: Date
  internalBallotCount?: number
  externalBallotCount?: number
  ballotCountsByVotingMethod?: Dictionary<number>
}

const TallyReportMetadata: React.FC<Props> = ({
  election,
  generatedAtTime,
  internalBallotCount = 0,
  externalBallotCount,
  ballotCountsByVotingMethod,
}) => {
  const electionDate = localeWeedkayAndDate.format(new Date(election.date))
  const generatedAt = localeLongDateAndTime.format(generatedAtTime)
  const totalBallotCount = internalBallotCount + (externalBallotCount ?? 0)

  let ballotsByVotingMethod = null
  if (ballotCountsByVotingMethod !== undefined) {
    const tableRows = Object.keys(ballotCountsByVotingMethod).map(
      (votingMethod) => {
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
      }
    )
    ballotsByVotingMethod = (
      <Contest>
        <h3>Ballots by Voting Method</h3>
        <Table data-testid="voting-method-table">
          <tbody>
            {tableRows}
            {externalBallotCount !== undefined && (
              <tr data-testid="externalvoterecords">
                <TD>External Results File</TD>
                <TD textAlign="right">{format.count(externalBallotCount)}</TD>
              </tr>
            )}
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
      </Contest>
    )
  }

  return (
    <React.Fragment>
      <p>
        {electionDate}, {election.county.name}, {election.state}
        <br />
        <Text small as="span">
          This report was created on {generatedAt}
        </Text>
      </p>
      {ballotsByVotingMethod}
    </React.Fragment>
  )
}

export default TallyReportMetadata
