import React from 'react'
import { fireEvent, render } from 'react-testing-library'
import fetchMock from 'fetch-mock'

import waitForExpect from 'wait-for-expect'

import App from './App'

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

async function sleep(milliseconds: number) {
  return new Promise(resolve => {
    window.setTimeout(resolve, milliseconds)
  })
}

it(`quick end-to-end flow with absent module-smartcards`, async () => {
  // this is what happens in demo mode
  fetchMock.get('/card/read', 500)

  const eventListenerCallbacksDictionary: any = {} // eslint-disable-line @typescript-eslint/no-explicit-any
  window.addEventListener = jest.fn((event, cb) => {
    eventListenerCallbacksDictionary[event] = cb
  })
  window.print = jest.fn(() => {
    eventListenerCallbacksDictionary.afterprint()
  })

  const { getByText, getByTestId, queryByText } = render(<App />)

  fireEvent.click(getByText('Load Sample Election File'))

  // wait long enough to get the /card/read to fail and flip the demo bit
  await sleep(250)

  getByText('Scan Your Activation Code')
  fireEvent.click(getByTestId('qrContainer'))

  // Go to First Contest
  fireEvent.click(getByText('Get Started'))

  // Go to Pre Review Screen
  while (!queryByText('Pre Review Screen')) {
    fireEvent.click(getByText('Next'))
  }
  getByText('Pre Review Screen')

  // Go to Review Screen
  fireEvent.click(getByText('Next'))
  getByText('Review Your Ballot Selections')

  // Print Screen
  fireEvent.click(getByText('Next'))
  getByText('Print your ballot')

  // Test Print Ballot Modal
  fireEvent.click(getByText('Print Ballot'))
  fireEvent.click(getByText('Yes, print my ballot.'))
  await waitForExpect(() => {
    expect(window.print).toBeCalled()
  })

  // Review and Cast Instructions
  // wait a little bit because the page transition is behind a setTimeout
  await sleep(100)
  getByText('Verify and Cast Your Ballot')
})
