import React from 'react'
import { fireEvent, render, wait } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import App from './App'

import { advanceTimers } from '../test/helpers/smartcards'

import {
  setElectionInLocalStorage,
  setStateInLocalStorage,
} from '../test/helpers/election'

jest.useFakeTimers()

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it('Cause "/card/read" API to catch', async () => {
  const failureResponse = jest.fn(() => undefined)
  // Configure Machine
  setElectionInLocalStorage()
  setStateInLocalStorage()

  // Mock Failed response
  fetchMock.get('/card/read', failureResponse, { overwriteRoutes: true })
  const { getByText } = render(<App />)

  // Ensure card polling interval time is passed
  advanceTimers()

  // Wait for component to render
  await wait(() => fireEvent.click(getByText('Insert Card')))

  // Expect that card API was called once
  expect(failureResponse).toHaveBeenCalledTimes(1)

  // Ensure card polling interval time is passed again
  advanceTimers()

  // Expect that card API has not been called again
  expect(failureResponse).toHaveBeenCalledTimes(1)
})
