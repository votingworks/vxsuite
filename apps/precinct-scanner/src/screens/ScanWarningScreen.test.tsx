import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { electionSampleDefinition } from '@votingworks/fixtures'
import { AdjudicationReason, CandidateContest } from '@votingworks/types'
import React from 'react'
import AppContext from '../contexts/AppContext'
import ScanWarningScreen from './ScanWarningScreen'

test('overvote', async () => {
  const acceptBallot = jest.fn()
  const contest = electionSampleDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  )!

  render(
    <AppContext.Provider
      value={{
        machineConfig: {
          codeVersion: 'test',
          machineId: '000',
        },
        electionDefinition: electionSampleDefinition,
      }}
    >
      <ScanWarningScreen
        acceptBallot={acceptBallot}
        adjudicationReasonInfo={[
          {
            type: AdjudicationReason.Overvote,
            contestId: contest.id,
            optionIds: contest.candidates.map(({ id }) => id),
            expected: 1,
          },
        ]}
      />
    </AppContext.Provider>
  )

  screen.getByText('Too many marks for:')
  screen.getByText(contest.title)
  userEvent.click(screen.getByText('Tabulate Ballot'))
  userEvent.click(screen.getByText('Yes, Tabulate Ballot'))
  expect(acceptBallot).toHaveBeenCalledTimes(1)
})

test('blank ballot', async () => {
  const acceptBallot = jest.fn()

  render(
    <AppContext.Provider
      value={{
        machineConfig: {
          codeVersion: 'test',
          machineId: '000',
        },
        electionDefinition: electionSampleDefinition,
      }}
    >
      <ScanWarningScreen
        acceptBallot={acceptBallot}
        adjudicationReasonInfo={[{ type: AdjudicationReason.BlankBallot }]}
      />
    </AppContext.Provider>
  )

  screen.getByText('Remove the ballot, fix the issue, then scan again.')
  userEvent.click(screen.getByText('Tabulate Ballot'))
  userEvent.click(screen.getByText('Yes, Tabulate Ballot'))
  expect(acceptBallot).toHaveBeenCalledTimes(1)
})

test('undervote', async () => {
  const acceptBallot = jest.fn()
  const contest = electionSampleDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  )!

  render(
    <AppContext.Provider
      value={{
        machineConfig: {
          codeVersion: 'test',
          machineId: '000',
        },
        electionDefinition: electionSampleDefinition,
      }}
    >
      <ScanWarningScreen
        acceptBallot={acceptBallot}
        adjudicationReasonInfo={[
          {
            type: AdjudicationReason.Undervote,
            contestId: contest.id,
            expected: 1,
            optionIds: [],
          },
        ]}
      />
    </AppContext.Provider>
  )

  screen.getByText('Remove the ballot, fix the issue, then scan again.')
  userEvent.click(screen.getByText('Tabulate Ballot'))
  userEvent.click(screen.getByText('Yes, Tabulate Ballot'))
  expect(acceptBallot).toHaveBeenCalledTimes(1)
})
