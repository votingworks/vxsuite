import React from 'react'
import { render, wait } from '@testing-library/react'

import App from './App'
import SampleApp, { getSampleStorage } from './SampleApp'
import { activationStorageKey, electionStorageKey } from './AppRoot'

import {
  election,
  setElectionInLocalStorage,
  setStateInLocalStorage,
} from '../test/helpers/election'
import { advanceTimers } from '../test/helpers/smartcards'

jest.useFakeTimers()

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

describe('loads election', () => {
  it('Machine is not configured by default', () => {
    const { getByText } = render(<App />)
    getByText('Device Not Configured')
  })

  it('sample app loads election and activates ballot', async () => {
    const storage = getSampleStorage()
    const { getAllByText, getByText } = render(<SampleApp storage={storage} />)
    advanceTimers()
    await wait(() => {
      expect(getAllByText(election.title).length).toBeGreaterThan(1)
      getByText(/Center Springfield/)
      getByText(/ballot style 12/)
    })
    expect(storage.get(electionStorageKey)).toBeTruthy()
    expect(storage.get(activationStorageKey)).toBeTruthy()
  })

  it('from localStorage', () => {
    setElectionInLocalStorage()
    setStateInLocalStorage()
    const { getByText } = render(<App />)
    getByText(election.title)
    expect(window.localStorage.getItem(electionStorageKey)).toBeTruthy()
  })
})
