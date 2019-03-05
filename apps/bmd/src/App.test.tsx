import React from 'react'
import ReactDOM from 'react-dom'
import { fireEvent, render, wait, waitForElement } from 'react-testing-library'

import electionSample from './data/electionSample.json'

import App, { electionKey, mergeWithDefaults } from './App'

const electionSampleAsString = JSON.stringify(mergeWithDefaults(electionSample))

const contest0 = electionSample.contests[0]!
const contest0Candidate0 = contest0.candidates[0]!.name
const contest0Candidate1 = contest0.candidates[1]!.name
const contest0Candidate2 = contest0.candidates[2]!.name

const Q2 = electionSample.contests[1]!
const Q2Candidate0 = Q2.candidates[0]!.name
const Q2Candidate1 = Q2.candidates[1]!.name
const Q2Candidate2 = Q2.candidates[2]!.name

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
    window.localStorage.setItem(electionKey, electionSampleAsString)
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
        new File([JSON.stringify(electionSample)], 'election.json', {
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

  // before we go to the next page, let's set up test of navigation
  jest.useFakeTimers()

  // TODO: replace next line with "Enter" keyDown on activation code input
  fireEvent.click(getByText('Submit'))
  expect(container.firstChild).toMatchSnapshot()

  jest.runAllTimers()

  expect(setTimeout).toHaveBeenCalledTimes(1)

  jest.useRealTimers()

  fireEvent.click(getByText('Get Started'))
  expect(container.firstChild).toMatchSnapshot()

  await waitForElement(() => getByText(contest0.title))
  fireEvent.click(getByText(contest0Candidate0).closest('label')!)
  fireEvent.click(getByText(contest0Candidate1).closest('label')!)
  expect(container.firstChild).toMatchSnapshot()
  getByText(
    `To vote for ${contest0Candidate1}, first uncheck the vote for ${contest0Candidate0}.`
  )
  fireEvent.click(getByText('Okay'))
  expect(
    (getByText(contest0Candidate0)
      .closest('label')!
      .querySelector('input') as HTMLInputElement).checked
  ).toBeTruthy()
  fireEvent.click(getByText('Next'))
  expect(container.firstChild).toMatchSnapshot()

  fireEvent.click(getByText(Q2Candidate2).closest('label')!)
  fireEvent.click(getByText(Q2Candidate0).closest('label')!)
  expect(container.firstChild).toMatchSnapshot()
  getByText(
    `To vote for ${Q2Candidate0}, first uncheck the vote for ${Q2Candidate2}.`
  )
  fireEvent.click(getByText('Okay'))
  fireEvent.click(getByText('add a write-in candidate').closest('label')!)
  getByText(
    `To vote for a write-in candidate, first uncheck the vote for ${Q2Candidate2}.`
  )
  fireEvent.click(getByText('Okay'))
  expect(
    (getByText(Q2Candidate2)
      .closest('label')!
      .querySelector('input') as HTMLInputElement).checked
  ).toBeTruthy()
  fireEvent.click(getByText('Review'))
  expect(container.firstChild).toMatchSnapshot()

  fireEvent.click(getAllByText('Change')[1])
  getByText(Q2.title)

  // advance through remaining questions to ensure we get full code coverage
  for (let i = 0; i < electionSample.contests.length - 2; i++) {
    fireEvent.click(getByText('Next'))
  }

  fireEvent.click(getByText('Review'))
  getByText('Official Ballot')

  fireEvent.click(getAllByText('Change')[0])
  getByText(contest0.title)

  fireEvent.click(getByText(contest0Candidate0).closest('label')!)
  fireEvent.click(getByText('add a write-in candidate').closest('label')!)
  fireEvent.click(getByText('Close'))
  fireEvent.click(getByText('add a write-in candidate').closest('label')!)
  expect(getByText('Write-In Candidate')).toBeTruthy()
  fireEvent.click(getByText('B').closest('button')!)
  fireEvent.click(getByText('O').closest('button')!)
  fireEvent.click(getByText('B').closest('button')!)
  fireEvent.click(getByText('Accept'))
  fireEvent.click(getByText('BOB').closest('label')!)
  fireEvent.click(getByText('BOB').closest('label')!)
  fireEvent.click(getByText('Close'))

  fireEvent.click(getByText('BOB').closest('label')!)
  fireEvent.click(getByText('B').closest('button')!)
  fireEvent.click(getByText('Y').closest('button')!)
  fireEvent.click(getByText('Close'))
  getByText('BOBBY')
  expect(
    (getByText('BOBBY')
      .closest('label')!
      .querySelector('input') as HTMLInputElement).checked
  ).toBeFalsy()

  fireEvent.click(getByText('BOBBY').closest('label')!)
  fireEvent.click(getByText('Accept'))
  fireEvent.click(getByText(contest0Candidate0).closest('label')!)
  getByText(
    `To vote for ${contest0Candidate0}, first uncheck the vote for BOBBY.`
  )
  fireEvent.click(getByText('Okay'))

  fireEvent.click(getByText('Review'))
  fireEvent.click(getAllByText('Change')[0])
  expect(getByText('BOBBY')).toBeTruthy()

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
    window.localStorage.setItem(electionKey, electionSampleAsString)
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
    window.localStorage.setItem(electionKey, electionSampleAsString)
    const { getByText, getByTestId } = render(<App />)
    fireEvent.change(getByTestId('activation-code'), {
      target: { value: 'MyVoiceIsMyPassword' },
    })
    // TODO: replace next line with "Enter" keyDown on activation code input
    fireEvent.click(getByText('Submit'))
    fireEvent.click(getByText('Get Started'))
    fireEvent.click(getByText(contest0Candidate0).closest('label')!)
    fireEvent.click(getByText('Settings'))
    fireEvent.click(getByText('Start Over'))
    fireEvent.click(getByText('Cancel'))
    fireEvent.click(getByText('Start Over'))
    fireEvent.click(getByText('Yes, Remove All Votes'))
    expect(getByText('Scan Your Activation Code')).toBeTruthy()
  })
})
