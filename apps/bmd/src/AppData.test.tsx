import React from 'react'
import { render } from '@testing-library/react'

import App from './App'
import { activationStorageKey, electionStorageKey } from './AppRoot'

import { election, setElectionInLocalStorage } from '../test/helpers/election'

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

  it('#sample url hash loads elecation and activates ballot', () => {
    window.location.href = '/#sample'
    const { getAllByText, getByText } = render(<App />)
    expect(getAllByText(election.title).length).toBeGreaterThan(1)
    getByText(/Center Springfield/)
    getByText(/ballot style 12/)
    expect(window.localStorage.getItem(electionStorageKey)).toBeTruthy()
    expect(window.localStorage.getItem(activationStorageKey)).toBeTruthy()
  })

  it('from localStorage', () => {
    setElectionInLocalStorage()
    const { getByText } = render(<App />)
    getByText(election.title)
    expect(window.localStorage.getItem(electionStorageKey)).toBeTruthy()
  })
})
