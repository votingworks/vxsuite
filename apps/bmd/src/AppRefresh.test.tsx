import React from 'react'
import { fireEvent, render, wait } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import App from './App'

import { noCard, voterCard, advanceTimers } from '../test/helpers/smartcards'

import {
  presidentContest,
  setElectionInLocalStorage,
  setStateInLocalStorage,
} from '../test/helpers/election'

let currentCard = noCard
fetchMock.get('/card/read', () => JSON.stringify(currentCard))
fetchMock.post('/card/write', (url, options) => {
  currentCard = {
    present: true,
    shortValue: options.body as string,
  }
  return ''
})

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
  let unmount = app.unmount

  // Insert Voter Card
  currentCard = voterCard
  advanceTimers()

  // Go to Voting Instructions
  await wait(() => fireEvent.click(getByText('Get Started')))
  advanceTimers()

  // Go to First Contest
  fireEvent.click(getByText('Start Voting'))
  advanceTimers()

  // ====================== END CONTEST SETUP ====================== //

  const candidate0 = presidentContest.candidates[0].name

  getByText(presidentContest.title)

  // Select first candiate
  fireEvent.click(getByText(candidate0))
  advanceTimers()
  expect(getByText(candidate0).closest('button')!.dataset.selected).toBe('true')

  unmount()

  app = render(<App />)
  getByText = app.getByText

  advanceTimers()

  // App is on first contest
  await wait(() => getByText(presidentContest.title))
  // First candidate selected
  expect(getByText(candidate0).closest('button')!.dataset.selected).toBe('true')
})
