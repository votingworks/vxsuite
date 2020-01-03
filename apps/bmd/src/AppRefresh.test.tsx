import React from 'react'
import { fireEvent, render, wait } from '@testing-library/react'
import fetchMock from 'fetch-mock'
import { advanceBy } from 'jest-date-mock'

import App from './App'

import {
  advanceTimers,
  getNewVoterCard,
  noCard,
} from '../test/helpers/smartcards'

import {
  presidentContest,
  setElectionInLocalStorage,
  setStateInLocalStorage,
} from '../test/helpers/election'

import { CardPresentAPI } from './config/types'

let currentCard = noCard
let longValueB64: string
fetchMock.get('/card/read', () => JSON.stringify(currentCard))
fetchMock.post('/card/write', (url, options) => {
  currentCard = {
    present: true,
    shortValue: options.body as string,
  }
  return ''
})
fetchMock.post('/card/write_long_b64', (url, options) => {
  longValueB64 = (options.body! as FormData).get('long_value') as string
  ;(currentCard as CardPresentAPI).longValueExists = true
})
fetchMock.get('/card/read_long_b64', () =>
  JSON.stringify({
    longValue: longValueB64,
  })
)

jest.useFakeTimers()

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it('Refresh window and expect to be on same contest', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  setElectionInLocalStorage()
  setStateInLocalStorage()

  let app = render(<App />)
  let getByText = app.getByText
  const unmount = app.unmount

  // Insert Voter Card
  currentCard = getNewVoterCard()
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

  app = render(<App />)
  getByText = app.getByText

  advanceTimers()

  // App is on first contest
  await wait(() => getByText(presidentContest.title))
  // First candidate selected
  expect(getByText(candidate0).closest('button')!.dataset.selected).toBe('true')
})
