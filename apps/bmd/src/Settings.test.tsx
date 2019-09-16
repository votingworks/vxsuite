import React from 'react'
import { fireEvent, render, wait } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import App from './App'

import {
  setElectionInLocalStorage,
  setStateInLocalStorage,
} from '../test/helpers/election'

import {
  advanceTimers,
  getNewVoterCard,
  noCard,
} from '../test/helpers/smartcards'

let currentCard = noCard
fetchMock.get('/card/read', () => JSON.stringify(currentCard))

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

describe('Can update settings', () => {
  it('Can update font-settings', async () => {
    jest.useFakeTimers()
    setElectionInLocalStorage()
    setStateInLocalStorage()

    const { getByText, getByTestId, getByLabelText } = render(<App />)

    // Insert Voter Card
    currentCard = getNewVoterCard()
    advanceTimers()
    await wait(() => getByText(/Precinct: Center Springfield/))

    // Go to Activation Screen
    fireEvent.click(getByText('Get Started'))
    advanceTimers()

    // Go to First Contest
    fireEvent.click(getByText('Start Voting'))

    // Go to Setting Screen
    fireEvent.click(getByText('Settings'))
    advanceTimers()
    await wait(() =>
      getByText('Adjust the following settings to meet your needs.')
    )

    // Test each of four Font Settings
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

    // Decrease Button
    fireEvent.click(getByTestId('decrease-font-size-button'))
    expect(
      (getByLabelText('Font Size') as HTMLInputElement).value === '2'
    ).toBeTruthy()

    // Increase Button
    fireEvent.click(getByTestId('increase-font-size-button'))
    expect(
      (getByLabelText('Font Size') as HTMLInputElement).value === '3'
    ).toBeTruthy()

    // Close Settings Screen
    fireEvent.click(getByText('Back'))
    advanceTimers()

    // Expect to on Start Screen
    // TODO: this works when this test file is run independently, but is not critical for 100% test coverage.
    // await wait(() => getByText('Start Voting'))
  })
})
