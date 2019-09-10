import React from 'react'
import { fireEvent, render, wait } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import { printingModalDisplaySeconds } from './pages/PrintPage'

import App from './App'

import {
  noCard,
  adminCard,
  pollWorkerCard,
  voterCard,
  altVoterCard,
  invalidatedVoterCard,
  getPrintedVoterCard,
  advanceTimers,
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

  const { getByText, queryByText } = render(<App />)

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
  currentCard = invalidatedVoterCard
  advanceTimers()
  await wait(() => getByText('Inactive Card'))

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // ---------------

  // Insert Voter card, go to first contest, then remove card, expect to be on
  // insert card screen.
  currentCard = voterCard
  advanceTimers()
  await wait(() => getByText(/Precinct: Center Springfield/))
  getByText(/Ballot Style: 12/)

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // ---------------

  // Alternate Ballot Style
  currentCard = altVoterCard
  advanceTimers()
  await wait(() => getByText(/Precinct: North Springfield/))
  getByText(/Ballot Style: 5/)
  fireEvent.click(getByText('Get Started'))

  advanceTimers()
  getByText('This ballot has 11 contests.')

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // ---------------

  // Test the Idle Screen
  const idleScreenCopy =
    'This voting station has been inactive for more than one minute.'

  // Insert Voter card
  currentCard = voterCard
  advanceTimers()
  await wait(() => getByText(/Precinct: Center Springfield/))

  // Elapse 60 seconds
  advanceTimers(60 * 1000)

  // Idle Screen is displayed
  getByText(idleScreenCopy)

  // User action removes Idle Screen
  fireEvent.click(getByText('Touch the screen to go back to the ballot.'))
  fireEvent.mouseDown(document)
  advanceTimers()
  expect(queryByText(idleScreenCopy)).toBeFalsy()

  // Elapse 60 seconds
  advanceTimers(60 * 1000)

  // Idle Screen is displayed
  getByText(idleScreenCopy)

  // Countdown works
  advanceTimers(1000)
  getByText('29 seconds')

  advanceTimers(29000)
  advanceTimers()
  getByText('Clearing ballot')

  advanceTimers()

  // 30 seconds passes, Expect Invalid card
  // await wait(() => getByText('Inactive Card'))

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // ---------------

  // Complete Voter Happy Path

  // Insert Voter card
  currentCard = voterCard
  advanceTimers()
  await wait(() => getByText(/Precinct: Center Springfield/))
  getByText(/Ballot Style: 12/)
  fireEvent.click(getByText('Get Started'))

  advanceTimers()
  getByText('This ballot has 20 contests.')
  fireEvent.click(getByText('Start Voting'))

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

    fireEvent.click(getByText('Next'))
  }

  // Pre-Review screen
  fireEvent.click(getByText('Next'))
  advanceTimers()
  getByText('Review Your Selections')
  fireEvent.click(getByText('Review Selections'))

  // Review Screen
  advanceTimers()
  getByText('Review Your Ballot Selections')
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
  fireEvent.click(getByText('Review Ballot'))
  advanceTimers()
  getByText('Review Your Ballot Selections')
  getByText(countyCommissionersContest.candidates[0].name)
  getByText(countyCommissionersContest.candidates[1].name)
  getByText('You may select 2 more candidates.')

  // Print Screen
  fireEvent.click(getByText('Next'))
  advanceTimers()
  getByText('Print your official ballot')

  // Test Print Ballot Modal
  fireEvent.click(getByText('Print Ballot'))
  fireEvent.click(getByText('No, go back.'))
  fireEvent.click(getByText('Print Ballot'))
  fireEvent.click(getByText('Yes, print my ballot.'))
  await wait() // wait for print
  advanceTimers()

  // Wait for printing setTimeout
  advanceTimers(printingModalDisplaySeconds * 1000)

  // Review and Cast Instructions
  await wait(() => getByText('You’re Almost Done…'))

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // Insert Voter card which has just printed.
  currentCard = getPrintedVoterCard()
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
