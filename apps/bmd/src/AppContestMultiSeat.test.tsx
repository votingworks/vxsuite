import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils'

import App from './App'

import {
  advanceTimersAndPromises,
  getNewVoterCard,
} from '../test/helpers/smartcards'

import {
  countyCommissionersContest,
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election'
import { fakeMachineConfigProvider } from '../test/helpers/fakeMachineConfig'

jest.useFakeTimers()

beforeEach(() => {
  window.location.href = '/'
})

it('Single Seat Contest', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard()
  const hardware = await MemoryHardware.buildStandard()
  const storage = new MemoryStorage()
  const machineConfig = fakeMachineConfigProvider()

  await setElectionInStorage(storage)
  await setStateInStorage(storage)

  const { container } = render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      machineConfig={machineConfig}
    />
  )
  await advanceTimersAndPromises()

  // Insert Voter Card
  card.insertCard(getNewVoterCard())
  await advanceTimersAndPromises()

  // Go to First Contest
  fireEvent.click(screen.getByText('Start Voting'))
  await advanceTimersAndPromises()

  // ====================== END CONTEST SETUP ====================== //

  const candidate0 = countyCommissionersContest.candidates[0]
  const candidate1 = countyCommissionersContest.candidates[1]
  const candidate2 = countyCommissionersContest.candidates[2]
  const candidate3 = countyCommissionersContest.candidates[3]
  const candidate4 = countyCommissionersContest.candidates[4]

  // Advance to multi-seat contest
  while (!screen.queryByText(countyCommissionersContest.title)) {
    fireEvent.click(screen.getByText('Next'))
    await advanceTimersAndPromises()
  }

  // Select 5 candidates for 4 seats
  fireEvent.click(screen.getByText(candidate0.name))
  await advanceTimersAndPromises()
  fireEvent.click(screen.getByText(candidate1.name))
  await advanceTimersAndPromises()
  fireEvent.click(screen.getByText(candidate2.name))
  await advanceTimersAndPromises()
  fireEvent.click(screen.getByText(candidate3.name))
  await advanceTimersAndPromises()
  fireEvent.click(screen.getByText(candidate4.name))
  await advanceTimersAndPromises()

  // Overvote modal is displayed
  screen.getByText(
    `You may only select ${countyCommissionersContest.seats} candidates in this contest. To vote for ${candidate4.name}, you must first unselect the selected candidates.`
  )

  // Capture styles of Single Candidate Contest
  expect(container.firstChild).toMatchSnapshot()

  // Go to Review Screen
  while (!screen.queryByText('Review Your Votes')) {
    fireEvent.click(screen.getByText('Next'))
    await advanceTimersAndPromises()
  }

  // Expect to see the first four selected candidates
  expect(screen.getByText(candidate0.name)).toBeTruthy()
  expect(screen.getByText(candidate1.name)).toBeTruthy()
  expect(screen.getByText(candidate2.name)).toBeTruthy()
  expect(screen.getByText(candidate3.name)).toBeTruthy()
})
