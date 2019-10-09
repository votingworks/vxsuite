import React from 'react'
import { fireEvent, render, wait, within } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import App from './App'

import withMarkup from '../test/helpers/withMarkup'

import {
  advanceTimers,
  getNewVoterCard,
  noCard,
} from '../test/helpers/smartcards'

import {
  singleSeatContestWithWriteIn,
  setElectionInLocalStorage,
  setStateInLocalStorage,
} from '../test/helpers/election'
import { VxMarkPlusVxPrint } from './config/types'

let currentCard = noCard
fetchMock.get('/card/read', () => JSON.stringify(currentCard))
fetchMock.post('/card/write', (url, options) => {
  currentCard = {
    present: true,
    shortValue: options.body as string,
  }
  return ''
})

fetchMock.post('/card/write_long_b64', () => JSON.stringify({ status: 'ok' }))

fetchMock.get('/printer/status', () => ({
  ok: true,
}))

fetchMock.post('/printer/jobs/new', () => ({
  id: 'printer-job-id',
}))

jest.useFakeTimers()

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it('Single Seat Contest with Write In', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  setElectionInLocalStorage()
  setStateInLocalStorage({
    appMode: VxMarkPlusVxPrint,
  })

  const { container, getByText, queryByText, getByTestId } = render(<App />)
  const getByTextWithMarkup = withMarkup(getByText)

  const getWithinKeyboard = (text: string) =>
    within(getByTestId('virtual-keyboard')).getByText(text)

  // Insert Voter Card
  currentCard = getNewVoterCard()
  advanceTimers()

  // Go to First Contest
  await wait(() => fireEvent.click(getByText('Start Voting')))
  advanceTimers()

  // ====================== END CONTEST SETUP ====================== //

  // Advance to Single-Seat Contest with Write-In
  while (!queryByText(singleSeatContestWithWriteIn.title)) {
    fireEvent.click(getByText('Next'))
    advanceTimers()
  }

  // Test Write-In Candidate Modal Cancel
  fireEvent.click(getByText('add write-in candidate').closest('button')!)
  fireEvent.click(getByText('Cancel'))

  // Add Write-In Candidate
  fireEvent.click(getByText('add write-in candidate').closest('button')!)
  expect(getByText('Write-In Candidate')).toBeTruthy()
  // Capture styles of Single Candidate Contest
  expect(container.firstChild).toMatchSnapshot()

  // Enter Write-in Candidate Name
  fireEvent.click(getWithinKeyboard('B'))
  fireEvent.click(getWithinKeyboard('O'))
  fireEvent.click(getWithinKeyboard('V'))
  fireEvent.click(getWithinKeyboard('⌫ delete'))
  fireEvent.click(getWithinKeyboard('B'))
  fireEvent.click(getByText('Accept'))
  advanceTimers()

  // Remove Write-In Candidate
  // await wait(() => getByText('BOB'))
  fireEvent.click(getByText('BOB').closest('button')!)
  fireEvent.click(getByText('Yes, Remove.'))
  advanceTimers()

  // Add Different Write-In Candidate
  fireEvent.click(getByText('add write-in candidate').closest('button')!)
  fireEvent.click(getWithinKeyboard('S').closest('button')!)
  fireEvent.click(getWithinKeyboard('A').closest('button')!)
  fireEvent.click(getWithinKeyboard('L').closest('button')!)
  fireEvent.click(getByText('Accept'))
  expect(getByText('SAL').closest('button')!.dataset.selected).toBe('true')

  // Try to Select Other Candidate when Max Candidates Selected.
  fireEvent.click(
    getByText(singleSeatContestWithWriteIn.candidates[0].name).closest(
      'button'
    )!
  )
  getByText(
    `You may only select ${singleSeatContestWithWriteIn.seats} candidate in this contest. To vote for ${singleSeatContestWithWriteIn.candidates[0].name}, you must first unselect the selected candidate.`
  )
  fireEvent.click(getByText('Okay'))
  advanceTimers() // For 200ms Delay in closing modal

  // Go to review page and confirm write in exists
  while (!queryByText('All Your Votes')) {
    fireEvent.click(getByText('Next'))
    advanceTimers()
  }

  // Review Screen
  await wait(() => getByText('All Your Votes'))
  expect(getByText('SAL')).toBeTruthy()
  expect(getByText('(write-in)')).toBeTruthy()

  // Print Screen
  fireEvent.click(getByTextWithMarkup('I’m Ready to Print My Ballot'))
  advanceTimers()
  expect(getByText('Official Ballot')).toBeTruthy()
  expect(getByText('(write-in)')).toBeTruthy()
  getByText('Printing Official Ballot')

  // Printer has new job
  advanceTimers()
  await wait(() => expect(fetchMock.calls('/printer/jobs/new')).toHaveLength(1))
})
