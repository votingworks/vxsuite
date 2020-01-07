import React from 'react'
import { fireEvent, render, wait } from '@testing-library/react'
import { advanceBy } from 'jest-date-mock'

import App from './App'

import { advanceTimers, getNewVoterCard } from '../test/helpers/smartcards'

import {
  presidentContest,
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election'

import { MemoryStorage } from './utils/Storage'
import { AppStorage } from './AppRoot'
import { MemoryCard } from './utils/Card'

jest.useFakeTimers()

beforeEach(() => {
  window.location.href = '/'
})

it('Refresh window and expect to be on same contest', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const storage = new MemoryStorage<AppStorage>()
  const card = new MemoryCard()

  setElectionInStorage(storage)
  setStateInStorage(storage)

  let { getByText, unmount } = render(<App storage={storage} card={card} />)

  // Insert Voter Card
  card.insertCard(getNewVoterCard())
  advanceTimers()

  // Go to First Contest
  await wait(() => fireEvent.click(getByText('Start Voting')))
  advanceTimers()

  // ====================== END CONTEST SETUP ====================== //

  const candidate0 = presidentContest.candidates[0].name

  getByText(presidentContest.title)

  // Select first candiate
  fireEvent.click(getByText(candidate0))
  advanceTimers()
  expect(getByText(candidate0).closest('button')!.dataset.selected).toBe('true')

  // advance time by CARD_LONG_VALUE_WRITE_DELAY to let background interval write to card
  advanceBy(1000)
  advanceTimers()

  unmount()
  ;({ getByText, unmount } = render(<App storage={storage} card={card} />))

  advanceTimers()

  // App is on first contest
  await wait(() => getByText(presidentContest.title))
  // First candidate selected
  expect(getByText(candidate0).closest('button')!.dataset.selected).toBe('true')
})
