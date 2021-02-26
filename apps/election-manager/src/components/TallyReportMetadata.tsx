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

interface Props {
  election: Election
  generatedAtTime: Date
  internalBallotCount: number
  externalBallotCount?: number
  ballotCountsByVotingMethod?: Dictionary<number>
}

const TallyReportMetadata: React.FC<Props> = ({
  election,
  generatedAtTime,
  internalBallotCount,
  externalBallotCount,
  ballotCountsByVotingMethod,
}) => {
  const electionDate = localeWeedkayAndDate.format(new Date(election.date))
  const generatedAt = localeLongDateAndTime.format(generatedAtTime)
  const totalBallotCount = internalBallotCount + (externalBallotCount ?? 0)
  const ballotsByDataSource =
    externalBallotCount !== undefined ? (
      <React.Fragment>
        <h3>Ballots Cast by Data Source</h3>
        <Table data-testid="data-source-table">
          <tbody>
            <tr>
              <TD as="th">Data Source</TD>
              <TD as="th" textAlign="right">
                Number of Ballots Cast
              </TD>
            </tr>
            <tr data-testid="internaldata">
              <TD>VotingWorks Data</TD>
              <TD textAlign="right">{format.count(internalBallotCount)}</TD>
            </tr>
            <tr data-testid="externalvoterecords">
              <TD>External Results File </TD>
              <TD textAlign="right">{format.count(externalBallotCount)}</TD>
            </tr>
            <tr data-testid="total">
              <TD>
                <strong>Total</strong>
              </TD>
              <TD textAlign="right">
                <strong>{format.count(totalBallotCount)}</strong>
              </TD>
            </tr>
          </tbody>
        </Table>
      </React.Fragment>
    ) : (
      <Text>
        Total Number of Ballots Cast: {format.count(totalBallotCount)}
      </Text>
    )

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
      <React.Fragment>
        <h3>Ballots Cast by Voting Method</h3>
        <Table data-testid="voting-method-table">
          <tbody>
            <tr>
              <TD as="th">Voting Method</TD>
              <TD as="th" textAlign="right">
                Number of Ballots Cast
              </TD>
            </tr>
            {tableRows}
            {externalBallotCount !== undefined && (
              <tr data-testid="externalvoterecords">
                <TD>External Results File</TD>
                <TD textAlign="right">{format.count(externalBallotCount)}</TD>
              </tr>
            )}
            <tr data-testid="total">
              <TD>
                <strong>Total</strong>
              </TD>
              <TD textAlign="right">
                <strong>{format.count(totalBallotCount)}</strong>
              </TD>
            </tr>
          </tbody>
        </Table>
      </React.Fragment>
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
      {ballotsByDataSource}
      {ballotsByVotingMethod}
    </React.Fragment>
  )
}

export default TallyReportMetadata
