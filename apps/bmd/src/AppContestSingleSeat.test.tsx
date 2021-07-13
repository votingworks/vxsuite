import React from 'react'
import { fireEvent, render, act, screen } from '@testing-library/react'
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils'

import App from './App'

import {
  advanceTimersAndPromises,
  getNewVoterCard,
} from '../test/helpers/smartcards'

import {
  presidentContest,
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

  const candidate0 = presidentContest.candidates[0].name
  const candidate1 = presidentContest.candidates[1].name

  screen.getByText(presidentContest.title)

  // Select first candidate
  fireEvent.click(screen.getByText(candidate0))
  await advanceTimersAndPromises()

  // Select second candidate
  fireEvent.click(screen.getByText(candidate1))
  await advanceTimersAndPromises()

  // Overvote modal is displayed
  screen.getByText(
    `You may only select ${presidentContest.seats} candidate in this contest. To vote for ${candidate1}, you must first unselect the selected candidate.`
  )

  // Capture styles of Single Candidate Contest
  expect(container.firstChild).toMatchSnapshot()

  // Close the modal
  fireEvent.click(screen.getByText('Okay'))
  await advanceTimersAndPromises()

  // First candidate is selected
  expect(screen.getByText(candidate0).closest('button')!.dataset.selected).toBe(
    'true'
  )

  // Second candidate is NOT selected
  expect(screen.getByText(candidate1).closest('button')!.dataset.selected).toBe(
    'false'
  )

  // Deselect the first candidate
  fireEvent.click(screen.getByText(candidate0))

  // Check that the aria label was updated to be include 'deselected' and is then updated back to the original state
  expect(
    screen.getByText(candidate0).closest('button')?.getAttribute('aria-label')
  ).toContain('Deselected,')
  expect(
    screen.getByText(candidate1).closest('button')?.getAttribute('aria-label')
  ).not.toContain('Deselected,')
  act(() => {
    jest.advanceTimersByTime(101)
  })
  expect(
    screen.getByText(candidate0).closest('button')?.getAttribute('aria-label')
  ).not.toContain('Deselected,')

  await advanceTimersAndPromises()
})
