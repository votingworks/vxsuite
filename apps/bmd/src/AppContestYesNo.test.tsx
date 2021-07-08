import React from 'react'
import { fireEvent, render, within, act } from '@testing-library/react'
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils'

import App from './App'

import withMarkup from '../test/helpers/withMarkup'

import {
  advanceTimersAndPromises,
  getNewVoterCard,
} from '../test/helpers/smartcards'

import {
  measure102Contest,
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

  setElectionInStorage(storage)
  setStateInStorage(storage)

  const { getByText, queryByText, getByTestId } = render(
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
  fireEvent.click(getByText('Start Voting'))
  await advanceTimersAndPromises()

  // ====================== END CONTEST SETUP ====================== //

  const getByTextWithMarkup = withMarkup(getByText)

  // Advance to multi-seat contest
  while (!queryByText(measure102Contest.title)) {
    fireEvent.click(getByText('Next'))
    await advanceTimersAndPromises()
  }

  // Select Yes
  fireEvent.click(getByText('Yes'))
  expect(getByText('Yes').closest('button')!.dataset.selected).toBe('true')

  // Unselect Yes
  fireEvent.click(getByText('Yes'))
  expect(getByText('Yes').closest('button')!.dataset.selected).toBe('false')

  // Check that the aria label was updated to be deselected properly and is then removed
  expect(getByText('Yes').getAttribute('aria-label')).toContain('Deselected,')
  expect(getByText('No').getAttribute('aria-label')).not.toContain(
    'Deselected,'
  )
  act(() => {
    jest.advanceTimersByTime(101)
  })
  expect(getByText('Yes').getAttribute('aria-label')).not.toContain(
    'Deselected,'
  )

  // Select Yes
  fireEvent.click(getByText('Yes'))
  expect(getByText('Yes').closest('button')!.dataset.selected).toBe('true')

  // Select No
  fireEvent.click(getByText('No'))
  expect(
    within(getByTestId('contest-choices')).getByText('No').closest('button')!
      .dataset.selected
  ).toBe('false')

  // Overvote modal is displayed
  getByTextWithMarkup(
    'Do you want to change your vote to No? To change your vote, first unselect your vote for Yes.'
  )
  fireEvent.click(getByText('Okay'))
  await advanceTimersAndPromises() // For 200ms Delay in closing modal

  // Go to review page and confirm write in exists
  while (!queryByText('Review Your Votes')) {
    fireEvent.click(getByText('Next'))
    await advanceTimersAndPromises()
  }

  const reviewTitle = getByTextWithMarkup(
    `${measure102Contest.section}${measure102Contest.title}`
  )
  const siblingTextContent =
    (reviewTitle.nextSibling && reviewTitle.nextSibling.textContent) || ''
  expect(siblingTextContent.trim()).toBe(
    `Yes on ${measure102Contest.shortTitle}`
  )
})
