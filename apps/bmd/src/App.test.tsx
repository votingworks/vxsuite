import React from 'react'
import { render } from '@testing-library/react'

import electionSample from './data/electionSample.json'

import App, { electionStorageKey } from './App'

import { election, setElectionInLocalStorage } from '../test/helpers/election'

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

describe('loads election', () => {
  it(`Machine is not configured by default`, () => {
    const { getByText } = render(<App />)
    getByText('Device Not Configured')
  })

  it(`via url hash and does't store in localStorage`, () => {
    window.location.href = '/#sample'
    const { getByText } = render(<App />)
    getByText(election.title)
    expect(window.localStorage.getItem(electionStorageKey)).toBeFalsy()
  })

  it(`from localStorage`, () => {
    setElectionInLocalStorage()
    const { getByText } = render(<App />)
    getByText(election.title)
    expect(window.localStorage.getItem(electionStorageKey)).toBeTruthy()
  })

  // TODO: Not sure this test works any longer. Need to relearn how this works.
  xit(`Error in App triggers reset and reloads window location`, () => {
    const mockConsoleError = jest.spyOn(console, 'error')
    mockConsoleError.mockImplementation(() => {
      // do nothing instead of triggering console.error()
    })
    window.localStorage.setItem(
      electionStorageKey,
      JSON.stringify(electionSample)
    )
    const { getByText } = render(<App />)
    getByText('Device Not Configured')
  })
})
