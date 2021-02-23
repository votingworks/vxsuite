import React from 'react'
import { render, getByText as domGetByText } from '@testing-library/react'

import { electionWithMsEitherNeither } from '@votingworks/fixtures'

import TallyReportMetadata from './TallyReportMetadata'
import { VotingMethod } from '../config/types'

test('Renders without tables when no external ballot count or voting table breakdown provided', () => {
  const pioclock = new Date(2020, 2, 14, 15, 9, 26)
  const { getByText, queryAllByText } = render(
    <TallyReportMetadata
      election={electionWithMsEitherNeither}
      generatedAtTime={pioclock}
      internalBallotCount={1234}
    />
  )
  getByText('Total Number of Ballots Cast: 1,234')
  getByText(/Wednesday, August 26, 2020/) // Election Date
  getByText(/Choctaw County/) // Election County
  getByText(/State of Mississippi/) // Election State
  getByText(/This report was created on Saturday, March 14, 2020, 3:09:26 PM/)

  expect(queryAllByText('Ballots Cast by Data Source').length).toBe(0)
  expect(queryAllByText('Ballots Cast by Voting Method').length).toBe(0)
})

test('Renders with data source tables when external ballot count specified', () => {
  const pioclock = new Date(2020, 2, 14, 15, 9, 26)
  const { getByText, queryAllByText } = render(
    <TallyReportMetadata
      election={electionWithMsEitherNeither}
      generatedAtTime={pioclock}
      internalBallotCount={1234}
      externalBallotCount={2345}
    />
  )
  getByText('Ballots Cast by Data Source')
  const internalRow = getByText('VotingWorks Data').closest('tr')!
  domGetByText(internalRow, '1,234')
  const externalRow = getByText('Imported SEMS File').closest('tr')!
  domGetByText(externalRow, '2,345')
  const totalRow = getByText('Total').closest('tr')!
  domGetByText(totalRow, '3,579')

  getByText(/Wednesday, August 26, 2020/) // Election Date
  getByText(/Choctaw County/) // Election County
  getByText(/State of Mississippi/) // Election State
  getByText(/This report was created on Saturday, March 14, 2020, 3:09:26 PM/)

  expect(queryAllByText('Ballots Cast by Voting Method').length).toBe(0)
})

test('Renders with data source table and voting method table when all data provided', () => {
  const pioclock = new Date(2020, 2, 14, 15, 9, 26)
  const ballotCounts = {
    [VotingMethod.Absentee]: 1200,
    [VotingMethod.Precinct]: 1045,
    [VotingMethod.Unknown]: 12,
  }
  const { getByText, getByTestId } = render(
    <TallyReportMetadata
      election={electionWithMsEitherNeither}
      generatedAtTime={pioclock}
      internalBallotCount={1234}
      externalBallotCount={2345}
      ballotCountsByVotingMethod={ballotCounts}
    />
  )
  getByText('Ballots Cast by Data Source')
  const dataSourceTable = getByTestId('data-source-table')
  const internalRow = domGetByText(dataSourceTable, 'VotingWorks Data').closest(
    'tr'
  )!
  domGetByText(internalRow, '1,234')
  const externalRow = domGetByText(
    dataSourceTable,
    'Imported SEMS File'
  ).closest('tr')!
  domGetByText(externalRow, '2,345')
  const totalRow = domGetByText(dataSourceTable, 'Total').closest('tr')!
  domGetByText(totalRow, '3,579')

  getByText('Ballots Cast by Voting Method')
  const votingMethodTable = getByTestId('voting-method-table')
  const row1 = domGetByText(votingMethodTable, 'Absentee').closest('tr')!
  domGetByText(row1, '1,200')
  const row2 = domGetByText(votingMethodTable, 'Precinct').closest('tr')!
  domGetByText(row2, '1,045')
  const row3 = domGetByText(votingMethodTable, 'Other').closest('tr')!
  domGetByText(row3, '12')
  const row4 = domGetByText(votingMethodTable, 'Imported SEMS File').closest(
    'tr'
  )!
  domGetByText(row4, '2,345')
  const row5 = domGetByText(votingMethodTable, 'Total').closest('tr')!
  domGetByText(row5, '3,579')

  getByText(/Wednesday, August 26, 2020/) // Election Date
  getByText(/Choctaw County/) // Election County
  getByText(/State of Mississippi/) // Election State
  getByText(/This report was created on Saturday, March 14, 2020, 3:09:26 PM/)
})

test('Hides the other row in the voting method table when empty', () => {
  const pioclock = new Date(2020, 2, 14, 15, 9, 26)
  const ballotCounts = {
    [VotingMethod.Absentee]: 1200,
    [VotingMethod.Precinct]: 1045,
    [VotingMethod.Unknown]: 0,
  }
  const { queryAllByText, unmount } = render(
    <TallyReportMetadata
      election={electionWithMsEitherNeither}
      generatedAtTime={pioclock}
      internalBallotCount={1234}
      externalBallotCount={2345}
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
    <TallyReportMetadata
      election={electionWithMsEitherNeither}
      generatedAtTime={pioclock}
      internalBallotCount={1234}
      externalBallotCount={2345}
      ballotCountsByVotingMethod={ballotCounts2}
    />
  )
  expect(queryAllByText2('Other').length).toBe(0)
})
