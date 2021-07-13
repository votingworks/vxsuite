import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { advanceBy } from 'jest-date-mock'

import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils'
import App from './App'

import {
  advanceTimers,
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

it('Refresh window and expect to be on same contest', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard()
  const hardware = await MemoryHardware.buildStandard()
  const storage = new MemoryStorage()
  const machineConfig = fakeMachineConfigProvider()

  await setElectionInStorage(storage)
  await setStateInStorage(storage)

  let { getByText, unmount } = render(
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
  advanceTimers()

  // Go to First Contest
  await waitFor(() => fireEvent.click(getByText('Start Voting')))

  // ====================== END CONTEST SETUP ====================== //

  const candidate0 = presidentContest.candidates[0].name

  getByText(presidentContest.title)

  // Select first candiate
  fireEvent.click(getByText(candidate0))
  advanceTimers()
  expect(getByText(candidate0).closest('button')!.dataset.selected).toBe('true')

  // advance time by CARD_LONG_VALUE_WRITE_DELAY to let background interval write to card
  advanceBy(1000)
  await waitFor(() => {
    // nothing?
  })

  unmount()
  ;({ getByText, unmount } = render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      machineConfig={machineConfig}
    />
  ))

  await advanceTimersAndPromises()
  await advanceTimersAndPromises(1)
  advanceTimers()

  // App is on first contest
  await waitFor(() => getByText(presidentContest.title))

  // First candidate selected
  expect(getByText(candidate0).closest('button')!.dataset.selected).toBe('true')
})
