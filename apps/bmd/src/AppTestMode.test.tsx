import React from 'react'
import { render } from '@testing-library/react'

import App from './App'

import {
  setElectionInLocalStorage,
  setStateInLocalStorage,
} from '../test/helpers/election'

jest.useFakeTimers()

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it('Displays testing message if not live mode', () => {
  setElectionInLocalStorage()
  setStateInLocalStorage({
    isLiveMode: false,
  })
  const { getByText } = render(<App />)
  getByText('Testing Mode')
})
