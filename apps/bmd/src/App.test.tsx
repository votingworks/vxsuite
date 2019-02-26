import React from 'react'
import ReactDOM from 'react-dom'
import { fireEvent, render, wait, waitForElement } from 'react-testing-library'

import electionFile from './data/election.json'
const electionAsString = JSON.stringify(electionFile)

import App, { electionKey } from './App'

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it('renders without crashing', () => {
  const div = document.createElement('div')
  ReactDOM.render(<App />, div)
  ReactDOM.unmountComponentAtNode(div)
})

describe('loads election', () => {
  it(`via url hash and does't store in localStorage`, () => {
    window.location.href = '/#sample'
    const { getByText } = render(<App />)
    getByText('Scan Your Activation Code')
    expect(window.localStorage.getItem(electionKey)).toBeFalsy()
  })

  it(`from localStorage`, async () => {
    window.localStorage.setItem(electionKey, electionAsString)
    const { getByText } = render(<App />)
    getByText('Scan Your Activation Code')
    expect(window.localStorage.getItem(electionKey)).toBeTruthy()

    // Tests are not passing.
    // Unsure why keyboard event does not trigger Mousetrap.

    // Basic "react-testing-library" keyboard event:
    // fireEvent.keyDown(document.body, {
    //   code: 'KeyK',
    //   key: 'k',
    //   metaKey: true,
    // })
    // More verbose keyboard event with to-be-deprecated keys (charCode and keyCode):
    // fireEvent.keyDown(document.body, {
    //   charCode: 75,
    //   code: 'KeyK',
    //   key: 'k',
    //   keyCode: 75,
    //   metaKey: true,
    // })

    // Direct Event Dispatch
    // interface ModifiedKeyboardEventInit extends KeyboardEventInit {
    //   keyCode: number
    // }
    // Direct Event Dispatch - option 1
    // document.dispatchEvent(
    //   new KeyboardEvent('keydown', {
    //     charCode: '75',
    //     code: 'KeyK',
    //     key: 'k',
    //     keyCode: 75,
    //     metaKey: true,
    //   } as ModifiedKeyboardEventInit)
    // )
    // Direct Event Dispatch - option 2
    // document.dispatchEvent(
    //   new KeyboardEvent('keydown', {
    //     keyCode: 75,
    //     metaKey: true,
    //   } as ModifiedKeyboardEventInit)
    // )

    // Tests to confirm keyboard shortcut was pressed…
    // await waitForElement(() => getByText('Configure Ballot Marking Device'))
    // expect(window.localStorage.getItem(electionKey)).toBeFalsy()
  })
})

it('end to end: election can be uploaded, voter can vote and print', async () => {
  /* tslint:disable-next-line */
  const eventListenerCallbacksDictionary: any = {}
  window.addEventListener = jest.fn((event, cb) => {
    eventListenerCallbacksDictionary[event] = cb
  })
  window.print = jest.fn(() => {
    eventListenerCallbacksDictionary.afterprint()
  })
  const { container, getByTestId, getByText, getAllByText } = render(<App />)
  expect(container).toMatchSnapshot()
  const fileInput = getByTestId('file-input')
  fireEvent.change(fileInput, {
    target: {
      files: [
        new File([JSON.stringify(electionFile)], 'election.json', {
          type: 'application/json',
        }),
      ],
    },
  })
  await waitForElement(() => getByText('Scan Your Activation Code'))
  expect(container).toMatchSnapshot()

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
    target: { value: 'MyVoiceIsMyPassword' },
  })
  // TODO: replace next line with "Enter" keyDown on activation code input
  fireEvent.click(getByText('Submit'))
  expect(container.firstChild).toMatchSnapshot()

  fireEvent.click(getByText('Get Started'))
  expect(container.firstChild).toMatchSnapshot()

  await waitForElement(() => getByText('President'))
  fireEvent.click(getByText('Minnie Mouse').closest('label') as HTMLElement)
  fireEvent.click(getByText('Mickey Mouse').closest('label') as HTMLElement)
  expect(container.firstChild).toMatchSnapshot()
  getByText(
    'To vote for Mickey Mouse, first uncheck the vote for Minnie Mouse.'
  )
  fireEvent.click(getByText('Okay'))
  expect(
    ((getByText('Minnie Mouse').closest('label') as HTMLElement).querySelector(
      'input'
    ) as HTMLInputElement).checked
  ).toBeTruthy()
  fireEvent.click(getByText('Next'))
  expect(container.firstChild).toMatchSnapshot()

  fireEvent.click(getByText('John Smith').closest('label') as HTMLElement)
  fireEvent.click(getByText('Chad Hanging').closest('label') as HTMLElement)
  expect(container.firstChild).toMatchSnapshot()
  getByText('To vote for Chad Hanging, first uncheck the vote for John Smith.')
  fireEvent.click(getByText('Okay'))
  fireEvent.click(getByText('add a write-in candidate').closest(
    'label'
  ) as HTMLElement)
  getByText(
    'To vote for a write-in candidate, first uncheck the vote for John Smith.'
  )
  fireEvent.click(getByText('Okay'))
  expect(
    ((getByText('John Smith').closest('label') as HTMLElement).querySelector(
      'input'
    ) as HTMLInputElement).checked
  ).toBeTruthy()
  fireEvent.click(getByText('Review'))
  expect(container.firstChild).toMatchSnapshot()

  fireEvent.click(getAllByText('Change')[1])
  getByText('Senator')

  fireEvent.click(getByText('Review'))
  getByText('Official Ballot')

  fireEvent.click(getAllByText('Change')[0])
  getByText('President')

  fireEvent.click(getByText('Minnie Mouse').closest('label') as HTMLElement)
  fireEvent.click(getByText('add a write-in candidate').closest(
    'label'
  ) as HTMLElement)
  fireEvent.click(getByText('Close'))
  fireEvent.click(getByText('add a write-in candidate').closest(
    'label'
  ) as HTMLElement)
  fireEvent.click(getByText('shift').closest('button') as HTMLElement)
  fireEvent.click(getByText('B').closest('button') as HTMLElement)
  fireEvent.click(getByText('shift').closest('button') as HTMLElement)
  fireEvent.click(getByText('o').closest('button') as HTMLElement)
  fireEvent.click(getByText('b').closest('button') as HTMLElement)
  fireEvent.click(getByText('Accept'))
  fireEvent.click(getByText('Bob').closest('label') as HTMLElement)
  fireEvent.click(getByText('Bob').closest('label') as HTMLElement)
  fireEvent.click(getByText('Close'))

  fireEvent.click(getByText('Minnie Mouse').closest('label') as HTMLElement)
  getByText('To vote for Minnie Mouse, first uncheck the vote for Bob.')
  fireEvent.click(getByText('Okay'))

  fireEvent.click(getByText('Review'))
  fireEvent.click(getAllByText('Change')[0])
  expect(getByText('Bob')).toBeTruthy()

  fireEvent.click(getByText('Review'))
  fireEvent.click(getByText('Print Ballot'))
  fireEvent.click(getByText('No. Go Back.'))
  fireEvent.click(getByText('Print Ballot'))
  fireEvent.click(getByText('Yes, I‘m finished. Print ballot.'))
  expect(window.print).toBeCalled()

  await waitForElement(() => getByText('Scan Your Activation Code'))
})

describe('can start over', () => {
  it('when has no votes', async () => {
    window.localStorage.setItem(electionKey, electionAsString)
    const { getByText, getByTestId } = render(<App />)
    fireEvent.change(getByTestId('activation-code'), {
      target: { value: 'MyVoiceIsMyPassword' },
    })
    // TODO: replace next line with "Enter" keyDown on activation code input
    fireEvent.click(getByText('Submit'))
    fireEvent.click(getByText('Get Started'))
    fireEvent.click(getByText('Settings'))
    fireEvent.click(getByText('Start Over'))
    expect(getByText('Scan Your Activation Code')).toBeTruthy()
  })
  it('when has votes', async () => {
    window.localStorage.setItem(electionKey, electionAsString)
    const { getByText, getByTestId } = render(<App />)
    fireEvent.change(getByTestId('activation-code'), {
      target: { value: 'MyVoiceIsMyPassword' },
    })
    // TODO: replace next line with "Enter" keyDown on activation code input
    fireEvent.click(getByText('Submit'))
    fireEvent.click(getByText('Get Started'))
    fireEvent.click(getByText('Minnie Mouse').closest('label') as HTMLElement)
    fireEvent.click(getByText('Settings'))
    fireEvent.click(getByText('Start Over'))
    fireEvent.click(getByText('Cancel'))
    fireEvent.click(getByText('Start Over'))
    fireEvent.click(getByText('Yes, Remove All Votes'))
    expect(getByText('Scan Your Activation Code')).toBeTruthy()
  })
})
