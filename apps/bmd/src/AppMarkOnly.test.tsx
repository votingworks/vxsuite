import React from 'react'
import { fireEvent, render, wait, within } from '@testing-library/react'
import fetchMock from 'fetch-mock'
import { fromByteArray } from 'base64-js'
import { encodeBallot } from '@votingworks/ballot-encoder'

import App from './App'

import {
  adminCard,
  advanceTimers,
  getExpiredVoterCard,
  getExpiredVoterCardWithVotes,
  getNewVoterCard,
  noCard,
  pollWorkerCard,
  sampleBallot,
} from '../test/helpers/smartcards'

import {
  electionAsString,
  presidentContest,
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

fetchMock.get('/card/read_long_b64', () =>
  JSON.stringify({ longValue: fromByteArray(encodeBallot(sampleBallot)) })
)

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it('VxMarkOnly flow', async () => {
  jest.useFakeTimers()

  const { getByTestId, getByLabelText, getByText } = render(<App />)
  // Query by text which includes markup.
  // https://stackoverflow.com/questions/55509875/how-to-query-by-text-string-which-contains-html-tags-using-react-testing-library
  const getByTextWithMarkup = (text: string): HTMLElement =>
    getByText((content, node) => {
      const hasText = (node: HTMLElement) => node.textContent === text
      const childrenDontHaveText = Array.from(node.children).every(
        child => !hasText(child as HTMLElement)
      )
      return hasText(node) && childrenDontHaveText
    })

  currentCard = noCard
  advanceTimers()

  // Default Unconfigured
  getByText('Device Not Configured')

  // ---------------

  // Configure election with Admin Card
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

  // select precinct
  getByText('State of Hamilton')
  const precinctSelect = getByLabelText('Precinct')
  const precinctId = (within(precinctSelect).getByText(
    'Center Springfield'
  ) as HTMLOptionElement).value
  fireEvent.change(precinctSelect, { target: { value: precinctId } })
  within(getByTestId('election-info')).getByText('Center Springfield')

  expect((getByText('VxMark Only') as HTMLButtonElement).disabled).toBeTruthy()

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
  getByText('Close Polls for Center Springfield')

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // ---------------

  // Insert Expired Voter Card
  currentCard = getExpiredVoterCard()
  advanceTimers()
  await wait(() => getByText('Expired Card'))

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert Card'))

  // // ---------------

  // Insert Expired Voter Card With Votes
  currentCard = getExpiredVoterCardWithVotes()
  advanceTimers()
  await wait(() => getByText('Expired Card'))

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert Card'))

  // ---------------

  // Complete VxMark Voter Happy Path

  // Insert Voter card
  currentCard = getNewVoterCard()
  advanceTimers()
  await wait(() => getByText(/Center Springfield/))
  getByText(/ballot style 12/)
  getByTextWithMarkup('Your ballot has 20 contests.')
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

    fireEvent.click(getByText('Next →'))
  }

  // Review Screen
  advanceTimers()
  getByText('All Your Votes')
  getByText(presidentContest.candidates[0].name)
  getByText(`Yes on ${measure102Contest.shortTitle}`)

  // Print Screen
  fireEvent.click(getByTextWithMarkup('I’m Ready to Print My Ballot'))
  advanceTimers()

  // Review and Cast Instructions
  getByText('Take your card to the Ballot Printer.')

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
  getByText('Open Polls for Center Springfield')

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
