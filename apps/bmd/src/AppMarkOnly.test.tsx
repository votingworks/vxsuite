import React from 'react'
import { fireEvent, render, within } from '@testing-library/react'
import { electionSample } from '@votingworks/ballot-encoder'

import App from './App'

import withMarkup from '../test/helpers/withMarkup'

import {
  adminCard,
  advanceTimersAndPromises,
  getExpiredVoterCard,
  getNewVoterCard,
  pollWorkerCard,
} from '../test/helpers/smartcards'

import {
  presidentContest,
  measure102Contest,
  voterContests,
} from '../test/helpers/election'
import { MemoryStorage } from './utils/Storage'
import { AppStorage } from './AppRoot'
import { MemoryCard } from './utils/Card'
import { MemoryHardware } from './utils/Hardware'
import fakeMachineId from '../test/helpers/fakeMachineId'

beforeEach(() => {
  window.location.href = '/'
})

it('VxMarkOnly flow', async () => {
  jest.useFakeTimers()

  const card = new MemoryCard()
  const hardware = new MemoryHardware()
  const storage = new MemoryStorage<AppStorage>()
  const machineId = fakeMachineId()
  const { getByTestId, getByLabelText, getByText } = render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      machineId={machineId}
    />
  )
  const getByTextWithMarkup = withMarkup(getByText)

  card.removeCard()
  await advanceTimersAndPromises()

  // Default Unconfigured
  getByText('Device Not Configured')

  // ---------------

  // Configure election with Admin Card
  card.insertCard(adminCard, electionSample)
  await advanceTimersAndPromises()
  fireEvent.click(getByText('Load Election Definition'))

  await advanceTimersAndPromises()
  getByText('Election definition is loaded.')

  // Remove card and expect not configured because precinct not selected
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Device Not Configured')

  // ---------------

  // Configure election with Admin Card
  card.insertCard(adminCard, electionSample)
  await advanceTimersAndPromises()
  getByLabelText('Precinct')

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
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Polls Closed')
  getByText('Insert Poll Worker card to open.')

  // ---------------

  // Open Polls with Poll Worker Card
  card.insertCard(pollWorkerCard)
  await advanceTimersAndPromises()
  fireEvent.click(getByText('Open Polls for Center Springfield'))
  getByText('Close Polls for Center Springfield')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert voter card to load ballot.')

  // ---------------

  // Insert Expired Voter Card
  card.insertCard(getExpiredVoterCard())
  await advanceTimersAndPromises()
  getByText('Expired Card')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert Card')

  // // ---------------

  // Insert Expired Voter Card With Votes
  card.insertCard(getExpiredVoterCard())
  await advanceTimersAndPromises()
  getByText('Expired Card')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert Card')

  // ---------------

  // Complete VxMark Voter Happy Path

  // Insert Voter card
  card.insertCard(getNewVoterCard())
  await advanceTimersAndPromises()
  getByText(/Center Springfield/)
  getByText(/ballot style 12/)
  getByTextWithMarkup('Your ballot has 20 contests.')
  fireEvent.click(getByText('Start Voting'))

  // Advance through every contest
  for (let i = 0; i < voterContests.length; i++) {
    const title = voterContests[i].title

    await advanceTimersAndPromises()
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

  // Review Screen
  await advanceTimersAndPromises()
  getByText('Review Your Votes')
  getByText(presidentContest.candidates[0].name)
  getByText(`Yes on ${measure102Contest.shortTitle}`)

  // Print Screen
  fireEvent.click(getByTextWithMarkup('I’m Ready to Print My Ballot'))
  await advanceTimersAndPromises()

  // Saving votes
  getByText('Saving your votes to the card')
  await advanceTimersAndPromises(2.5) // redirect after 2.5 seconds

  // Review and Cast Instructions
  getByText('Take your card to the Ballot Printer.')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert voter card to load ballot.')

  // ---------------

  // Close Polls with Poll Worker Card
  card.insertCard(pollWorkerCard)
  await advanceTimersAndPromises()
  fireEvent.click(getByText('Close Polls for Center Springfield'))
  getByText('Open Polls for Center Springfield')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert Poll Worker card to open.')

  // ---------------

  // Unconfigure with Admin Card
  card.insertCard(adminCard, electionSample)
  await advanceTimersAndPromises()
  getByText('Election definition is loaded.')
  fireEvent.click(getByText('Remove'))
  await advanceTimersAndPromises()

  // Default Unconfigured
  getByText('Device Not Configured')
})
