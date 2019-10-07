import React from 'react'
import { fireEvent, render, wait, within } from '@testing-library/react'
import fetchMock from 'fetch-mock'
import { advanceBy } from 'jest-date-mock'

import { printerMessageTimeoutSeconds } from './pages/PrintPage'

import App from './App'

import {
  adminCard,
  advanceTimers,
  getAlternateNewVoterCard,
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

fetchMock.post('/card/write_long_b64', () => JSON.stringify({ status: 'ok' }))

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

  const { getByLabelText, getAllByText, getByText, getByTestId } = render(
    <App />
  )
  // Query by text which includes markup.
  // https://stackoverflow.com/questions/55509875/how-to-query-by-text-string-which-contains-html-tags-using-react-testing-library
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

  // Remove card and expect not configured because precinct not selected
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Device Not Configured'))

  // ---------------

  // Configure election with Admin Card
  currentCard = adminCard
  advanceTimers()
  await wait(() => getByLabelText('Precinct'))

  // Select precinct
  getByText('State of Hamilton')
  const precinctSelect = getByLabelText('Precinct')
  const precinctId = (within(precinctSelect).getByText(
    'Center Springfield'
  ) as HTMLOptionElement).value
  fireEvent.change(precinctSelect, { target: { value: precinctId } })
  within(getByTestId('election-info')).getByText('Center Springfield')

  fireEvent.click(getByText('VxMark+Print'))
  expect((getByText('VxMark+Print') as HTMLButtonElement).disabled).toBeTruthy()

  fireEvent.click(getByText('Live Election Mode'))
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
  await wait(() =>
    fireEvent.click(getByText('Open Polls for Center Springfield'))
  )
  getByText('Open polls and print Polls Opened report?')
  fireEvent.click(within(getByTestId('modal')).getByText('Yes'))
  await wait(() => getByText('Close Polls for Center Springfield'))
  expect(fetchMock.calls('/printer/jobs/new')).toHaveLength(1)

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // ---------------

  // Voter partially votes, remove card, and is on insert card screen.
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

  // Alternate Precinct
  currentCard = getAlternateNewVoterCard()
  advanceTimers()
  await wait(() => getByText('Invalid Card'))
  getByText('Card is not configured for this precinct.')

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

      // We write to the card when no changes to the ballot state have happened for a second.
      // To test that this is happening, we advance time by a bit more than a second
      // We also need to advance timers so the interval will run, see that time has passed,
      // and finally write to the card.
      advanceBy(1100)
      advanceTimers()
      expect(fetchMock.calls('/card/write_long_b64')).toHaveLength(1)

      // If we wait another second and advance timers, without any change made to the card,
      // we should not see another call to save the card data
      advanceBy(1100)
      advanceTimers()
      expect(fetchMock.calls('/card/write_long_b64')).toHaveLength(1)
    }

    // Vote for yesno contest
    else if (title === measure102Contest.title) {
      fireEvent.click(getByText('Yes'))
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
  getByText('All Your Votes')
  getByText(countyCommissionersContest.candidates[0].name)
  getByText(countyCommissionersContest.candidates[1].name)
  getByText('You may still vote for 2 more candidates.')

  // Print Screen
  fireEvent.click(getByText('I’m Ready to Print My Ballot'))
  advanceTimers()
  getByText('Printing Official Ballot')

  // After timeout, show Verify and Cast Instructions
  await wait() // TODO: unsure why this `wait` is needed, but it is.
  advanceTimers(printerMessageTimeoutSeconds)
  await wait(() => getByText('You’re Almost Done…'))
  expect(fetchMock.calls('/printer/jobs/new')).toHaveLength(2)

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

  // ---------------

  // Close Polls with Poll Worker Card
  currentCard = pollWorkerCard
  advanceTimers()
  await wait(() =>
    fireEvent.click(getByText('Close Polls for Center Springfield'))
  )
  getByText('Close Polls and print Polls Closed report?')
  fireEvent.click(within(getByTestId('modal')).getByText('Yes'))
  await wait(() => getByText('Open Polls for Center Springfield'))
  expect(fetchMock.calls('/printer/jobs/new')).toHaveLength(3)

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert Poll Worker card to open.'))

  // ---------------

  // Unconfigure with Admin Card
  currentCard = adminCard
  advanceTimers()
  await wait(() => getByText('Election definition is loaded.'))
  fireEvent.click(getByText('Remove'))
  advanceTimers()

  // Default Unconfigured
  getByText('Device Not Configured')
})
