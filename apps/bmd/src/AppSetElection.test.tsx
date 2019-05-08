import React from 'react'
import { fireEvent, render, wait, waitForElement } from 'react-testing-library'

import electionSample from './data/electionSample.json'

import App from './App'

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it(`basic end-to-end flow`, async () => {
  /* tslint:disable-next-line */
  const eventListenerCallbacksDictionary: any = {}
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
  await waitForElement(() => getByText('Scan Your Activation Code'))
  expect(container).toMatchSnapshot()

  // Activation Page
  // TODO: onBlur causes stack overflow error
  // fireEvent.blur(getByTestId('activation-code'))
  fireEvent.change(getByTestId('activation-code'), {
    target: { value: 'Invalid Activation Code' },
  })
  expect(
    (getByTestId('activation-code') as HTMLInputElement).value ===
      'Invalid Activation Code'
  ).toBeTruthy()
  wait(() => (getByTestId('activation-code') as HTMLInputElement).value === '')
  fireEvent.change(getByTestId('activation-code'), {
    target: { value: 'VX.23.12D' },
  })

  // TODO: replace next line with "Enter" keyDown on activation code input
  fireEvent.click(getByText('Submit'))
  expect(container.firstChild).toMatchSnapshot()
})
