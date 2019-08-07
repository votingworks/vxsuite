import React from 'react'
import { fireEvent, render } from '@testing-library/react'

import electionSample from './data/electionSample.json'

import App, { electionStorageKey, mergeWithDefaults } from './App'
import { Election } from './config/types'

const election = electionSample as Election

const electionSampleAsString = JSON.stringify(
  mergeWithDefaults(electionSample as Election)
)

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
    window.localStorage.setItem(electionStorageKey, electionSampleAsString)
    const { getByText } = render(<App />)
    getByText(election.title)
    expect(window.localStorage.getItem(electionStorageKey)).toBeTruthy()
  })

  // Not sure this test works any longer
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

describe(`Can update settings`, () => {
  it(`Can update font-settings`, () => {
    window.localStorage.setItem(electionStorageKey, electionSampleAsString)
    const { getByText, getByTestId, getByLabelText } = render(<App />)
    fireEvent.change(getByTestId('activation-code'), {
      target: { value: 'VX.23.12' },
    })
    // TODO: replace next line with "Enter" keyDown on activation code input
    fireEvent.click(getByText('Submit'))
    fireEvent.click(getByText('Get Started'))
    fireEvent.click(getByText('Start Voting'))
    fireEvent.click(getByText('Settings'))
    expect(
      (getByLabelText('Font Size') as HTMLInputElement).value === '1'
    ).toBeTruthy()
    fireEvent.change(getByLabelText('Font Size'), {
      target: { value: '0' },
    })
    expect(
      (getByLabelText('Font Size') as HTMLInputElement).value === '0'
    ).toBeTruthy()
    fireEvent.change(getByLabelText('Font Size'), {
      target: { value: '1' },
    })
    expect(
      (getByLabelText('Font Size') as HTMLInputElement).value === '1'
    ).toBeTruthy()
    fireEvent.change(getByLabelText('Font Size'), {
      target: { value: '2' },
    })
    expect(
      (getByLabelText('Font Size') as HTMLInputElement).value === '2'
    ).toBeTruthy()
    fireEvent.change(getByLabelText('Font Size'), {
      target: { value: '3' },
    })
    expect(
      (getByLabelText('Font Size') as HTMLInputElement).value === '3'
    ).toBeTruthy()
    fireEvent.click(getByTestId('decrease-font-size-button'))
    expect(
      (getByLabelText('Font Size') as HTMLInputElement).value === '2'
    ).toBeTruthy()
    fireEvent.click(getByTestId('increase-font-size-button'))
    expect(
      (getByLabelText('Font Size') as HTMLInputElement).value === '3'
    ).toBeTruthy()
  })
})
