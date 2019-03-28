import React from 'react'
import ReactDOM from 'react-dom'
import { fireEvent, render, wait, waitForElement } from 'react-testing-library'

import electionSample from './data/electionSample.json'

import App, { electionKey, mergeWithDefaults } from './App'
import { CandidateContest, Election } from './config/types'

const contest0 = electionSample.contests[0] as CandidateContest
const contest0candidate0 = contest0.candidates[0]
const contest0candidate1 = contest0.candidates[1]

const electionSampleAsString = JSON.stringify(
  mergeWithDefaults(electionSample as Election)
)

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it(`renders without crashing`, () => {
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
  it(`Error in App triggers reset and reloads window location`, () => {
    const mockConsoleError = jest.spyOn(console, 'error')
    mockConsoleError.mockImplementation(() => {
      // do nothing instead of triggering console.error()
    })
    window.localStorage.setItem(electionKey, JSON.stringify(electionSample))
    const { getByText } = render(<App />)
    getByText('Configure Ballot Marking Device')
  })
})

it(`end to end: election can be uploaded, voter can vote and print`, async () => {
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

  // Upload Config
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
    target: { value: 'MyVoiceIsMyPassword' },
  })

  // TODO: replace next line with "Enter" keyDown on activation code input
  fireEvent.click(getByText('Submit'))
  expect(container.firstChild).toMatchSnapshot()

  // Get Started Page
  fireEvent.click(getByText('Get Started'))
  expect(container.firstChild).toMatchSnapshot()

  // First Contest Page
  getByText(contest0.title)
  expect(contest0.seats).toEqual(1)

  // Test overvote modal
  fireEvent.click(getByText(contest0candidate0.name).closest('label')!)
  fireEvent.click(getByText(contest0candidate1.name).closest('label')!)
  expect(container.firstChild).toMatchSnapshot()
  getByText(
    `You may only select ${
      contest0.seats
    } candidate in this contest. To vote for ${
      contest0candidate1.name
    }, you must first unselect selected candidate.`
  )
  fireEvent.click(getByText('Okay'))
  expect(
    (getByText(contest0candidate0.name)
      .closest('label')!
      .querySelector('input') as HTMLInputElement).checked
  ).toBeTruthy()

  // Go to Multi-Seat Contest
  fireEvent.click(getByText('Review'))
  const multiSeatContest = electionSample.contests.find(
    c => c.seats === 4
  ) as CandidateContest
  expect(multiSeatContest.seats).toEqual(4)

  fireEvent.click(getByText(multiSeatContest.title)
    .closest('dt')!
    .querySelector('button') as HTMLButtonElement)
  getByText(multiSeatContest.title)

  const multiSeatCandidate0 = multiSeatContest.candidates[0]
  const multiSeatCandidate1 = multiSeatContest.candidates[1]
  const multiSeatCandidate2 = multiSeatContest.candidates[2]
  const multiSeatCandidate3 = multiSeatContest.candidates[3]
  const multiSeatCandidate4 = multiSeatContest.candidates[4]
  fireEvent.click(getByText(multiSeatCandidate0.name).closest('label')!)
  fireEvent.click(getByText(multiSeatCandidate1.name).closest('label')!)
  fireEvent.click(getByText(multiSeatCandidate2.name).closest('label')!)
  fireEvent.click(getByText(multiSeatCandidate3.name).closest('label')!)
  fireEvent.click(getByText(multiSeatCandidate4.name).closest('label')!)
  getByText(
    `You may only select ${
      multiSeatContest.seats
    } candidates in this contest. To vote for ${
      multiSeatCandidate4.name
    }, you must first unselect selected candidates.`
  )
  fireEvent.click(getByText('Review'))
  getByText('Official Ballot')
  expect(getByText(multiSeatCandidate0.name)).toBeTruthy()
  expect(getByText(multiSeatCandidate1.name)).toBeTruthy()
  expect(getByText(multiSeatCandidate2.name)).toBeTruthy()
  expect(getByText(multiSeatCandidate3.name)).toBeTruthy()

  // Test Write-In Candidate flow
  const contestWithWriteIns = electionSample.contests.find(
    c => !!c.allowWriteIns && c.seats === 1
  ) as CandidateContest
  expect(contestWithWriteIns).toBeTruthy()
  const contestWithWriteInsFirstCandidate = contestWithWriteIns.candidates[0]

  // Select change button for contest
  fireEvent.click(getByText(contestWithWriteIns.title)
    .closest('dt')!
    .querySelector('button') as HTMLButtonElement)
  getByText(contestWithWriteIns.title)

  // Test Write-In Candidate Modal Cancel
  fireEvent.click(getByText('add write-in candidate').closest('button')!)
  fireEvent.click(getByText('Cancel'))

  // Add Write-In Candidate
  fireEvent.click(getByText('add write-in candidate').closest('button')!)
  expect(getByText('Write-In Candidate')).toBeTruthy()
  fireEvent.click(getByText('B').closest('button')!)
  fireEvent.click(getByText('O').closest('button')!)
  fireEvent.click(getByText('B').closest('button')!)
  fireEvent.click(getByText('Accept'))

  // Remove Write-In Candidate
  fireEvent.click(getByText('BOB').closest('label')!)
  fireEvent.click(getByText('Yes, Remove.'))

  // Add Different Write-In Candidate
  fireEvent.click(getByText('add write-in candidate').closest('button')!)
  fireEvent.click(getByText('S').closest('button')!)
  fireEvent.click(getByText('A').closest('button')!)
  fireEvent.click(getByText('L').closest('button')!)
  fireEvent.click(getByText('Accept'))
  expect(
    (getByText('SAL')
      .closest('label')!
      .querySelector('input') as HTMLInputElement).checked
  ).toBeTruthy()

  // Try to Select Other Candidate when Max Candidates Selected.
  fireEvent.click(
    getByText(contestWithWriteInsFirstCandidate.name).closest('label')!
  )
  getByText(
    `You may only select ${
      contest0.seats
    } candidate in this contest. To vote for ${
      contestWithWriteInsFirstCandidate.name
    }, you must first unselect selected candidate.`
  )
  fireEvent.click(getByText('Okay'))

  // Go to review page and confirm write in exists
  fireEvent.click(getByText('Review'))
  expect(getByText('SAL')).toBeTruthy()

  fireEvent.click(getByText(contest0.title)
    .closest('dt')!
    .querySelector('button') as HTMLButtonElement)

  // Click through all questions for test coverage
  electionSample.contests.forEach((_, i) => {
    if (i === electionSample.contests.length - 1) {
      fireEvent.click(getByText('Review'))
    } else {
      fireEvent.click(getByText('Next'))
    }
  })

  // Test Print Ballot Modal
  fireEvent.click(getByText('Print Ballot'))
  fireEvent.click(getByText('No. Go Back.'))
  fireEvent.click(getByText('Print Ballot'))
  fireEvent.click(getByText('Yes, I‘m finished. Print ballot.'))
  expect(window.print).toBeCalled()

  // Review and Cast Instructions
  getByText('Verify and Cast Your Ballot')
  fireEvent.click(getByText('Start Over'))

  // Back to beginning
  getByText('Scan Your Activation Code')
})

describe('can start over', () => {
  it(`when has no votes`, async () => {
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
  it(`when has votes`, async () => {
    window.localStorage.setItem(electionKey, electionSampleAsString)
    const { getByText, getByTestId } = render(<App />)
    fireEvent.change(getByTestId('activation-code'), {
      target: { value: 'MyVoiceIsMyPassword' },
    })
    // TODO: replace next line with "Enter" keyDown on activation code input
    fireEvent.click(getByText('Submit'))
    fireEvent.click(getByText('Get Started'))
    fireEvent.click(getByText(contest0candidate0.name).closest('label')!)
    fireEvent.click(getByText('Settings'))
    fireEvent.click(getByText('Start Over'))
    fireEvent.click(getByText('Cancel'))
    fireEvent.click(getByText('Start Over'))
    fireEvent.click(getByText('Yes, Remove All Votes'))
    expect(getByText('Scan Your Activation Code')).toBeTruthy()
  })
})

describe(`Can update settings`, () => {
  it(`Can update font-settings`, () => {
    window.localStorage.setItem(electionKey, electionSampleAsString)
    const { getByText, getByTestId, getByLabelText } = render(<App />)
    fireEvent.change(getByTestId('activation-code'), {
      target: { value: 'MyVoiceIsMyPassword' },
    })
    // TODO: replace next line with "Enter" keyDown on activation code input
    fireEvent.click(getByText('Submit'))
    fireEvent.click(getByText('Get Started'))
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
