import React from 'react'
import { render } from '@testing-library/react'

import App from './App'
import { electionStorageKey } from './AppRoot'

import { election, setElectionInLocalStorage } from '../test/helpers/election'

jest.useFakeTimers()

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
})
