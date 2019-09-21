import React from 'react'
import { fireEvent, render, wait, within } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import { printerMessageTimeoutSeconds } from './pages/PrintPage'

import App from './App'

import {
  adminCard,
  advanceTimers,
  getAlternateNewVoterCard,
  getExpiredVoterCard,
  getVoidedVoterCard,
  getNewVoterCard,
  getUsedVoterCard,
  noCard,
  pollWorkerCard,
} from '../test/helpers/smartcards'

import {
  electionAsString,
  presidentContest,
  countyCommissionersContest,
  measure102Contest,
  voterContests,
} from '../test/helpers/election'

let currentCard = noCard
fetchMock.get('/card/read', () => JSON.stringify(currentCard))

fetchMock.post('/card/write', (url, options) => {
  currentCard = {
    present: true,
    shortValue: options.body as string,
  }
  return ''
})

fetchMock.get('/card/read_long', () =>
  JSON.stringify({ longValue: electionAsString })
)

fetchMock.get('/printer/status', () => ({
  ok: true,
}))

fetchMock.post('/printer/jobs/new', () => ({
  id: 'printer-job-id',
}))

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it('VxMark+Print end-to-end flow', async () => {
  jest.useFakeTimers()

  const { getAllByText, getByText, getByTestId } = render(<App />)
  const getByTextWithMarkup = (text: string) =>
    getByText((_, node) => node.textContent === text)

  currentCard = noCard
  advanceTimers()

  // Default Unconfigured
  getByText('Device Not Configured')

  // ---------------

  // Configure with Admin Card
  currentCard = adminCard
  advanceTimers()
  await wait(() => fireEvent.click(getByText('Load Election Definition')))

  advanceTimers()
  await wait(() => getByText('Election definition is loaded.'))

  fireEvent.click(getByText('VxMark+Print'))
  expect((getByText('VxMark+Print') as HTMLButtonElement).disabled).toBeTruthy()

  fireEvent.click(getByText('Live Election Mode'))
  getByText('Switch to Live Election Mode and zero Printed Ballots count?')
  fireEvent.click(getByText('Yes'))

  expect(
    (getByText('Live Election Mode') as HTMLButtonElement).disabled
  ).toBeTruthy()

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Polls Closed'))
  getByText('Insert Poll Worker card to open.')

  // ---------------

  // Open Polls with Poll Worker Card
  currentCard = pollWorkerCard
  advanceTimers()
  await wait(() => fireEvent.click(getByText('Open Polls')))
  getByText('Open polls -- Print report 1 of 3?')
  await wait(() => fireEvent.click(getByText('Yes')))
  getByText('Open polls -- Print report 2 of 3?')
  await wait(() => fireEvent.click(getByText('Yes')))
  getByText('Open polls -- Print report 3 of 3?')
  await wait(() => fireEvent.click(getByText('Yes')))
  getByText('Close Polls')

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // ---------------

  // Insert used Voter card
  currentCard = getVoidedVoterCard()
  advanceTimers()
  await wait(() => getByText('Expired Card'))

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // ---------------

  // Insert expired Voter card
  currentCard = getExpiredVoterCard()
  advanceTimers()
  await wait(() => getByText('Expired Card'))

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // ---------------

  // Insert Voter card, go to first contest, then remove card, expect to be on
  // insert card screen.
  currentCard = getNewVoterCard()
  advanceTimers()
  await wait(() => getByText(/Center Springfield/))
  getByText(/ballot style 12/)
  getByTextWithMarkup('This ballot has 20 contests.')

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // ---------------

  // Alternate Ballot Style
  currentCard = getAlternateNewVoterCard()
  advanceTimers()
  await wait(() => getByText(/North Springfield/))
  getByText(/ballot style 5/)
  getByTextWithMarkup('This ballot has 11 contests.')

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // ---------------

  // Complete Voter Happy Path

  // Insert Voter card
  currentCard = getNewVoterCard()
  advanceTimers()
  await wait(() => getByText(/Center Springfield/))
  getByText(/ballot style 12/)
  getByTextWithMarkup('This ballot has 20 contests.')

  // Adjust Text Size
  const changeTextSize = within(getByTestId('change-text-size-buttons'))
  const textSizeButtons = changeTextSize.getAllByText('A')
  expect(textSizeButtons.length).toBe(3)
  fireEvent.click(textSizeButtons[0]) // html element has new font size
  fireEvent.click(textSizeButtons[1]) // html element has default font size

  // Start Voting
  fireEvent.click(getAllByText('Start Voting')[1])

  // Advance through every contest
  for (let i = 0; i < voterContests.length; i++) {
    const title = voterContests[i].title

    advanceTimers()
    getByText(title)

    // Vote for candidate contest
    if (title === presidentContest.title) {
      fireEvent.click(getByText(presidentContest.candidates[0].name))
    }
    // Vote for yesno contest
    else if (title === measure102Contest.title) {
      fireEvent.click(getByText('Yes'))
    }

    if (i === voterContests.length - 1) {
      fireEvent.click(getByText('Review →'))
      continue
    }
    fireEvent.click(getByText('Next →'))
  }

  // Review Screen
  advanceTimers()
  getByText('Review Votes')
  getByText(presidentContest.candidates[0].name)
  getByText(`Yes on ${measure102Contest.shortTitle}`)

  // Change "County Commissioners" Contest
  fireEvent.click(
    getByText(
      `${countyCommissionersContest.section}, ${countyCommissionersContest.title}`
    )
  )
  advanceTimers()
  getByText(/Vote for 4/i)

  // Select first candidate
  fireEvent.click(getByText(countyCommissionersContest.candidates[0].name))
  fireEvent.click(getByText(countyCommissionersContest.candidates[1].name))

  // Back to Review screen
  fireEvent.click(getByText('Review →'))
  advanceTimers()
  getByText('Review Votes')
  getByText(countyCommissionersContest.candidates[0].name)
  getByText(countyCommissionersContest.candidates[1].name)
  getByText('You may still vote for 2 more candidates.')

  // Print Screen
  fireEvent.click(getByText('I’m Ready to Print My Ballot'))
  advanceTimers()
  getByText('Printing Official Ballot')

  // After timeout, show Verify and Cast Instructions
  await wait() // TODO: unsure why this `wait` is needed, but it is.
  advanceTimers(printerMessageTimeoutSeconds * 1000)
  await wait(() => getByText('You’re Almost Done…'))
  expect(fetchMock.calls('/printer/jobs/new')).toHaveLength(1)

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // Insert Voter card which has just printed to see "cast" instructions again.
  currentCard = getUsedVoterCard()
  advanceTimers()
  await wait(() => getByText('You’re Almost Done…'))

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // Insert Pollworker Card
  currentCard = pollWorkerCard
  advanceTimers()
  await wait(() => fireEvent.click(getByText('Close Polls')))
  getByText('Close Polls -- Print report 1 of 3?')
  await wait(() => fireEvent.click(getByText('Yes')))
  getByText('Close Polls -- Print report 2 of 3?')
  await wait(() => fireEvent.click(getByText('Yes')))
  getByText('Close Polls -- Print report 3 of 3?')
  await wait(() => fireEvent.click(getByText('Yes')))
  getByText('Open Polls')

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert Poll Worker card to open.'))

  // Unconfigure with Admin Card
  currentCard = adminCard
  advanceTimers()
  await wait(() => getByText('Election definition is loaded.'))
  fireEvent.click(getByText('Remove'))
  advanceTimers()

  // Default Unconfigured
  getByText('Device Not Configured')
})
