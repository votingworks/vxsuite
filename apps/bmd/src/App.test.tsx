import React from 'react'
import ReactDOM from 'react-dom'
import { fireEvent, render } from '@testing-library/react'

import electionSample from './data/electionSample.json'

import App, {
  activationStorageKey,
  electionStorageKey,
  mergeWithDefaults,
  votesStorageKey,
} from './App'
import { CandidateContest, Election } from './config/types'

const election = electionSample as Election
const contest0 = election.contests[0] as CandidateContest
const contest0candidate0 = contest0.candidates[0]

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
    expect(window.localStorage.getItem(electionStorageKey)).toBeFalsy()
  })
  it(`from localStorage`, () => {
    window.localStorage.setItem(electionStorageKey, electionSampleAsString)
    const { getByText } = render(<App />)
    getByText('Scan Your Activation Code')
    expect(window.localStorage.getItem(electionStorageKey)).toBeTruthy()
  })
  it(`Error in App triggers reset and reloads window location`, () => {
    const mockConsoleError = jest.spyOn(console, 'error')
    mockConsoleError.mockImplementation(() => {
      // do nothing instead of triggering console.error()
    })
    window.localStorage.setItem(
      electionStorageKey,
      JSON.stringify(electionSample)
    )
    const { getByText } = render(<App />)
    getByText('Load Election Configuration File')
  })
  it(`App uses data from localStorage when set`, () => {
    const ballotStyleId = electionSample.ballotStyles[0].id
    const precinctId = electionSample.precincts[0].id
    const presidentFirstCandidate = electionSample.contests.find(
      c => c.id === 'president'
    )!.candidates![0]

    window.localStorage.setItem(electionStorageKey, electionSampleAsString)
    window.localStorage.setItem(
      activationStorageKey,
      JSON.stringify({
        ballotStyleId,
        precinctId,
      })
    )
    window.localStorage.setItem(
      votesStorageKey,
      JSON.stringify({
        president: [presidentFirstCandidate],
      })
    )

    const { getByText } = render(<App />)

    // Go to Voting Instructions
    fireEvent.click(getByText('Get Started'))

    // Go to First Contest
    fireEvent.click(getByText('Start Voting'))

    // First contest candidate should be selected
    const candidate1Input = getByText(presidentFirstCandidate.name)
      .closest('label')!
      .querySelector('input')!
    expect(candidate1Input.checked).toBeTruthy()
  })
})

describe('can start over', () => {
  it(`when has no votes`, async () => {
    window.localStorage.setItem(electionStorageKey, electionSampleAsString)
    const { getByText, getByTestId } = render(<App />)
    fireEvent.change(getByTestId('activation-code'), {
      target: { value: 'VX.23.12' },
    })
    // TODO: replace next line with "Enter" keyDown on activation code input
    fireEvent.click(getByText('Submit'))
    fireEvent.click(getByText('Get Started'))
    fireEvent.click(getByText('Start Voting'))
    fireEvent.click(getByText('Settings'))
    fireEvent.click(getByText('Start Over'))
    expect(getByText('Scan Your Activation Code')).toBeTruthy()
  })
  it(`when has votes`, async () => {
    window.localStorage.setItem(electionStorageKey, electionSampleAsString)
    const { getByText, getByTestId } = render(<App />)
    fireEvent.change(getByTestId('activation-code'), {
      target: { value: 'VX.23.12' },
    })
    // TODO: replace next line with "Enter" keyDown on activation code input
    fireEvent.click(getByText('Submit'))
    fireEvent.click(getByText('Get Started'))
    fireEvent.click(getByText('Start Voting'))
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
