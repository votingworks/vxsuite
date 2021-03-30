import React from 'react'
import { render, getByText as domGetByText } from '@testing-library/react'

import { electionWithMsEitherNeither } from '@votingworks/fixtures'

import TallyReportSummary from './TallyReportSummary'
import { VotingMethod } from '../config/types'

test('Renders with data source table and voting method table when all data provided', () => {
  const ballotCounts = {
    [VotingMethod.Absentee]: 1200,
    [VotingMethod.Precinct]: 1045,
    [VotingMethod.Unknown]: 12,
  }
  const { getByText, getByTestId } = render(
    <TallyReportSummary
      election={electionWithMsEitherNeither}
      totalBallotCount={3579}
      ballotCountsByVotingMethod={ballotCounts}
    />
  )

  getByText('Ballots by Voting Method')
  const votingMethodTable = getByTestId('voting-method-table')
  const row1 = domGetByText(votingMethodTable, 'Absentee').closest('tr')!
  domGetByText(row1, '1,200')
  const row2 = domGetByText(votingMethodTable, 'Precinct').closest('tr')!
  domGetByText(row2, '1,045')
  const row3 = domGetByText(votingMethodTable, 'Other').closest('tr')!
  domGetByText(row3, '12')
  const row5 = domGetByText(votingMethodTable, 'Total Ballots Cast').closest(
    'tr'
  )!
  domGetByText(row5, '3,579')
})

test('Hides the other row in the voting method table when empty', () => {
  const ballotCounts = {
    [VotingMethod.Absentee]: 1200,
    [VotingMethod.Precinct]: 1045,
    [VotingMethod.Unknown]: 0,
  }
  const { queryAllByText, unmount } = render(
    <TallyReportSummary
      election={electionWithMsEitherNeither}
      totalBallotCount={3579}
      ballotCountsByVotingMethod={ballotCounts}
    />
  )
  expect(queryAllByText('Other').length).toBe(0)

  unmount()

  const ballotCounts2 = {
    [VotingMethod.Absentee]: 1200,
    [VotingMethod.Precinct]: 1045,
  }
  const { queryAllByText: queryAllByText2 } = render(
    <TallyReportSummary
      election={electionWithMsEitherNeither}
      totalBallotCount={3579}
      ballotCountsByVotingMethod={ballotCounts2}
    />
  )
  expect(queryAllByText2('Other').length).toBe(0)
})
