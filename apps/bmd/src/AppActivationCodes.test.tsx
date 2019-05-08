import React from 'react'
import { fireEvent, render, wait } from 'react-testing-library'

import electionSample from './data/electionSample.json'

import App, { electionKey, mergeWithDefaults } from './App'
import { Election } from './config/types'

const electionSampleAsString = JSON.stringify(
  mergeWithDefaults(electionSample as Election)
)

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it(`Activation code is reset if not submitted`, async () => {
  window.localStorage.setItem(electionKey, electionSampleAsString)
  const { getByTestId } = render(<App />)

  jest.useFakeTimers()

  const activationCodeInput = getByTestId('activation-code') as HTMLInputElement

  // Set invalid activation code and do not submit form
  fireEvent.change(getByTestId('activation-code'), {
    target: { value: 'VX.21.5' },
  })
  expect(activationCodeInput.value).toBe('VX.21.5')

  jest.advanceTimersByTime(1000)

  // Activation code input value is cleared.
  expect(activationCodeInput.value).toBe('')

  jest.useRealTimers()
})

it(`Invalid activation code submitted does nothing and is reset.`, async () => {
  window.localStorage.setItem(electionKey, electionSampleAsString)
  const { getByText, getByTestId } = render(<App />)

  jest.useFakeTimers()

  const activationCodeInput = getByTestId('activation-code') as HTMLInputElement

  // Set invalid activation code and do not submit form.
  fireEvent.change(getByTestId('activation-code'), {
    target: { value: 'foo.bar.baz' },
  })
  expect(activationCodeInput.value).toBe('foo.bar.baz')

  // Submit activation code
  fireEvent.click(getByText('Submit'))

  // Still on Activation Screen
  getByText('Scan Your Activation Code')

  jest.runOnlyPendingTimers()

  // Activation code input value is cleared.
  await wait(() => {
    expect(activationCodeInput.value).toBe('')
  })

  jest.useRealTimers()
})

it(`Displays alternate ballot`, () => {
  window.localStorage.setItem(electionKey, electionSampleAsString)
  const { getByText, getByTestId } = render(<App />)

  fireEvent.change(getByTestId('activation-code'), {
    // Enter activation code with different ballot style.
    target: { value: 'VX.21.5' },
  })

  // TODO: replace next line with "Enter" keyDown on activation code input
  fireEvent.click(getByText('Submit'))

  // Get Started Page
  fireEvent.click(getByText('Get Started'))

  // Number of questions maps to expected length
  getByText('1 of 11')
})
