import React from 'react'
import { fireEvent, render, wait } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import App from './App'

import { noCard, voterCard, advanceTimers } from '../test/helpers/smartcards'

import {
  setElectionInLocalStorage,
  setStateInLocalStorage,
} from '../test/helpers/election'

jest.useFakeTimers()

let currentCard = noCard
fetchMock.get('/card/read', () => JSON.stringify(currentCard))

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it(`Cause /machine-id to catch`, async () => {
  fetchMock.get('/machine-id', () => undefined, { overwriteRoutes: true })

  setElectionInLocalStorage()
  setStateInLocalStorage()

  const { getByText } = render(<App />)

  // Insert Voter Card
  currentCard = voterCard
  advanceTimers()

  // Go to Voting Instructions
  await wait(() => fireEvent.click(getByText('Get Started')))

  // ====================== END CONTEST SETUP ====================== //
})
