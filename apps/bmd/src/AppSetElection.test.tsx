import React from 'react'
import { fireEvent, render, wait } from '@testing-library/react'

import electionSample from './data/electionSample.json'

import App from './App'

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it(`Sets election config file`, async () => {
  const eventListenerCallbacksDictionary: any = {} // eslint-disable-line @typescript-eslint/no-explicit-any
  window.addEventListener = jest.fn((event, cb) => {
    eventListenerCallbacksDictionary[event] = cb
  })
  window.print = jest.fn(() => {
    eventListenerCallbacksDictionary.afterprint()
  })

  const { container, getByTestId, getByText } = render(<App />)
  expect(container).toMatchSnapshot()

  /// Upload Config
  const fileInput = getByTestId('file-input')
  fireEvent.change(fileInput, {
    target: {
      files: [
        new File([JSON.stringify(electionSample)], 'election.json', {
          type: 'application/json',
        }),
      ],
    },
  })
  await wait(() => expect(getByText('Scan Your Activation Code')).toBeTruthy())
})
