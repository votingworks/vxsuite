import React from 'react'
import { fireEvent, render, wait } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import App from './App'

import {
  setElectionInLocalStorage,
  setStateInLocalStorage,
} from '../test/helpers/election'

import { noCard, voterCard, advanceTimers } from '../test/helpers/smartcards'

let currentCard = noCard
fetchMock.get('/card/read', () => JSON.stringify(currentCard))

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

describe(`Can update settings`, () => {
  it(`Can update font-settings`, async () => {
    jest.useFakeTimers()
    setElectionInLocalStorage()
    setStateInLocalStorage()

    const { getByText, getByTestId, getByLabelText } = render(<App />)

    currentCard = voterCard
    advanceTimers()

    await wait(() => getByText(/Precinct: Center Springfield/))

    fireEvent.click(getByText('Get Started'))
    advanceTimers()

    fireEvent.click(getByText('Start Voting'))

    fireEvent.click(getByText('Settings'))
    advanceTimers()

    await wait(() =>
      getByText('Adjust the following settings to meet your needs.')
    )

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
