import React from 'react'
import { fireEvent, render, waitFor, within } from '@testing-library/react'
import { asElectionDefinition } from '@votingworks/fixtures'
import { parseElection } from '@votingworks/types'
import * as GLOBALS from './config/globals'

// import { electionSample } from '@votingworks/types'
import electionSample from './data/electionSample.json'

import App from './App'

import {
  setElectionInStorage,
  setStateInStorage,
  presidentContest,
  voterContests,
  electionDefinition,
} from '../test/helpers/election'

import withMarkup from '../test/helpers/withMarkup'

import {
  adminCardForElection,
  advanceTimersAndPromises,
  pollWorkerCardForElection,
} from '../test/helpers/smartcards'

import { MemoryStorage } from './utils/Storage'
import { AppStorage } from './AppRoot'
import { MemoryCard } from './utils/Card'
import fakePrinter from '../test/helpers/fakePrinter'
import { MemoryHardware } from './utils/Hardware'
import { fakeMachineConfigProvider } from '../test/helpers/fakeMachineConfig'
import { REPORT_PRINTING_TIMEOUT_SECONDS } from './config/globals'
import { VxMarkPlusVxPrint } from './config/types'

beforeEach(() => {
  window.location.href = '/'
})

jest.useFakeTimers()
jest.setTimeout(15000)

test('Cardless Voting Flow', async () => {
  const { electionHash } = asElectionDefinition(parseElection(electionSample))
  const card = new MemoryCard()
  const adminCard = adminCardForElection(electionHash)
  const pollWorkerCard = pollWorkerCardForElection(electionHash)
  const hardware = MemoryHardware.standard
  const printer = fakePrinter()
  const storage = new MemoryStorage<AppStorage>()
  const machineConfig = fakeMachineConfigProvider({
    appMode: VxMarkPlusVxPrint,
  })
  const { getByLabelText, getByText, getByTestId, queryByText } = render(
    <App
      card={card}
      hardware={hardware}
      machineConfig={machineConfig}
      printer={printer}
      storage={storage}
    />
  )
  const getByTextWithMarkup = withMarkup(getByText)

  card.removeCard()
  await advanceTimersAndPromises()

  // Default Unconfigured
  getByText('Device Not Configured')

  // ---------------

  // Configure with Admin Card
  card.insertCard(adminCard, electionSample)
  await advanceTimersAndPromises()
  fireEvent.click(getByText('Load Election Definition'))

  await advanceTimersAndPromises()
  getByText('Election definition is loaded.')
  getByLabelText('Precinct')
  within(getByTestId('election-info')).getByText(
    `Election ID: ${electionDefinition.electionHash.slice(0, 10)}`
  )

  // Select precinct
  getByText('State of Hamilton')
  const precinctSelect = getByLabelText('Precinct')
  const precinctId = (within(precinctSelect).getByText(
    'Center Springfield'
  ) as HTMLOptionElement).value
  fireEvent.change(precinctSelect, { target: { value: precinctId } })
  within(getByTestId('election-info')).getByText('Center Springfield')

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
  getByText('Open polls and print Polls Opened report?')
  fireEvent.click(within(getByTestId('modal')).getByText('Yes'))
  await advanceTimersAndPromises()
  getByText('Printing Polls Opened report for Center Springfield')
  await advanceTimersAndPromises(REPORT_PRINTING_TIMEOUT_SECONDS)
  expect(printer.print).toHaveBeenCalledTimes(1)

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  await waitFor(() => getByText('Insert voter card to load ballot.'))

  // ---------------

  // Activate Ballot Style for Cardless Voter
  card.insertCard(pollWorkerCard)
  await advanceTimersAndPromises()
  getByText('Activate Ballot Style')
  fireEvent.click(within(getByTestId('precincts')).getByText('12'))
  getByText('Ballot style 12 has been activated.')

  // Poll Worker deactivates ballot style
  fireEvent.click(getByText('Deactivate Ballot Style 12'))
  getByText('Activate Ballot Style')

  // Poll Worker reactivates ballot style
  fireEvent.click(within(getByTestId('precincts')).getByText('12'))

  // Poll Workder removes their card
  card.removeCard()
  await advanceTimersAndPromises()

  // Voter Ballot Style is active
  getByText(/ballot style 12/)
  getByTextWithMarkup('Your ballot has 21 contests.')
  fireEvent.click(getByText('Start Voting'))

  // Voter votes in first contest
  fireEvent.click(getByText(presidentContest.candidates[0].name))
  fireEvent.click(getByText('Next'))

  // Poll Worker inserts card and sees message that there are votes
  card.insertCard(pollWorkerCard)
  await advanceTimersAndPromises()
  getByText('Ballot Contains Votes')

  // Poll Worker resets ballot to remove votes
  fireEvent.click(getByText('Reset Ballot'))

  // Back on Poll Worder screen
  getByText('Activate Ballot Style')

  // Activates Ballot Style again
  fireEvent.click(within(getByTestId('precincts')).getByText('12'))
  getByText('Ballot style 12 has been activated.')

  // Poll Workder removes their card
  card.removeCard()
  await advanceTimersAndPromises()

  // Voter Ballot Style is active
  getByText(/ballot style 12/)
  getByTextWithMarkup('Your ballot has 21 contests.')
  fireEvent.click(getByText('Start Voting'))

  // Voter makes selection in first contest and then advances to review screen
  for (let i = 0; i < voterContests.length; i++) {
    const { title } = voterContests[i]

    await advanceTimersAndPromises()
    getByText(title)

    // Vote for a candidate contest
    if (title === presidentContest.title) {
      fireEvent.click(getByText(presidentContest.candidates[0].name))
    }

    fireEvent.click(getByText('Next'))
  }

  // Advance to print ballot
  fireEvent.click(getByTextWithMarkup('I’m Ready to Print My Ballot'))
  getByText('Printing Official Ballot')

  // Trigger seal image loaded
  fireEvent.load(getByTestId('printed-ballot-seal-image'))

  // Reset ballot
  await advanceTimersAndPromises()

  // Expire timeout for display of "Printing Ballot" screen
  await advanceTimersAndPromises(GLOBALS.BALLOT_PRINTING_TIMEOUT_SECONDS)

  // Reset Ballot is called with instructions type "cardless"
  // Show Verify and Cast Instructions
  getByText('You’re Almost Done')
  expect(queryByText('3. Return the card to a poll worker.')).toBeFalsy()

  // Wait for timeout to return to Insert Card screen
  await advanceTimersAndPromises(GLOBALS.BALLOT_INSTRUCTIONS_TIMEOUT_SECONDS)
  getByText('Insert voter card to load ballot.')
})

test('Another Voter submits blank ballot and clicks Done', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard()
  const pollWorkerCard = pollWorkerCardForElection(
    electionDefinition.electionHash
  )
  const hardware = MemoryHardware.standard
  const printer = fakePrinter()
  const storage = new MemoryStorage<AppStorage>()
  const machineConfig = fakeMachineConfigProvider({
    appMode: VxMarkPlusVxPrint,
  })

  card.removeCard()

  setElectionInStorage(storage, electionDefinition)
  setStateInStorage(storage)

  const { getByText, getByTestId, queryByText } = render(
    <App
      card={card}
      hardware={hardware}
      printer={printer}
      storage={storage}
      machineConfig={machineConfig}
    />
  )

  const getByTextWithMarkup = withMarkup(getByText)

  // ====================== END CONTEST SETUP ====================== //

  // Activate Ballot Style for Cardless Voter
  card.insertCard(pollWorkerCard)
  await advanceTimersAndPromises()
  fireEvent.click(within(getByTestId('precincts')).getByText('12'))
  getByText('Ballot style 12 has been activated.')

  // Poll Workder removes their card
  card.removeCard()
  await advanceTimersAndPromises()

  // Voter Ballot Style is active
  getByText(/ballot style 12/)
  getByTextWithMarkup('Your ballot has 21 contests.')
  fireEvent.click(getByText('Start Voting'))

  // Voter makes selection in first contest and then advances to review screen
  for (let i = 0; i < voterContests.length; i++) {
    const { title } = voterContests[i]

    await advanceTimersAndPromises()
    getByText(title)

    // Vote for a candidate contest
    if (title === presidentContest.title) {
      fireEvent.click(getByText(presidentContest.candidates[0].name))
    }

    fireEvent.click(getByText('Next'))
  }

  // Advance to print ballot
  fireEvent.click(getByTextWithMarkup('I’m Ready to Print My Ballot'))
  getByText('Printing Official Ballot')

  // Trigger seal image loaded
  fireEvent.load(getByTestId('printed-ballot-seal-image'))

  // Reset ballot
  await advanceTimersAndPromises()

  // Expire timeout for display of "Printing Ballot" screen
  await advanceTimersAndPromises(GLOBALS.BALLOT_PRINTING_TIMEOUT_SECONDS)

  // Reset Ballot is called with instructions type "cardless"
  // Show Verify and Cast Instructions
  getByText('You’re Almost Done')
  expect(queryByText('3. Return the card to a poll worker.')).toBeFalsy()

  // Click "Done" to get back to Insert Card screen
  fireEvent.click(getByText('Done'))
  getByText('Insert voter card to load ballot.')
})
