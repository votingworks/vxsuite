import React from 'react'
import { render, fireEvent, within, screen } from '@testing-library/react'
import {
  electionSampleDefinition as election,
  electionSampleDefinition,
} from '@votingworks/fixtures'
import {
  MemoryStorage,
  MemoryCard,
  MemoryHardware,
  getZeroTally,
} from '@votingworks/utils'

import App from './App'

import { CARD_EXPIRATION_SECONDS } from './config/globals'
import {
  advanceTimersAndPromises,
  getExpiredVoterCard,
  getOtherElectionVoterCard,
  getVoidedVoterCard,
  createVoterCard,
  getNewVoterCard,
  pollWorkerCardForElection,
} from '../test/helpers/smartcards'

import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election'
import utcTimestamp from './utils/utcTimestamp'
import { fakeMachineConfigProvider } from '../test/helpers/fakeMachineConfig'
import { VxPrintOnly } from './config/types'

jest.useFakeTimers()

beforeEach(() => {
  window.location.href = '/'
})

test('Display App Card Unhappy Paths', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard()
  const hardware = await MemoryHardware.buildStandard()
  const storage = new MemoryStorage()
  const machineConfig = fakeMachineConfigProvider()

  card.removeCard()

  await setElectionInStorage(storage)
  await setStateInStorage(storage)

  render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      machineConfig={machineConfig}
    />
  )
  await advanceTimersAndPromises()

  // ====================== END CONTEST SETUP ====================== //

  // Insert used Voter card
  card.insertCard(getOtherElectionVoterCard())
  await advanceTimersAndPromises()
  screen.getByText('Card is not configured for this election.')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  screen.getByText('Insert voter card to load ballot.')

  // ---------------

  // Insert used Voter card
  card.insertCard(getVoidedVoterCard())
  await advanceTimersAndPromises()
  screen.getByText('Expired Card')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  screen.getByText('Insert voter card to load ballot.')

  // ---------------

  // Insert expired Voter card
  card.insertCard(getExpiredVoterCard())
  await advanceTimersAndPromises()
  screen.getByText('Expired Card')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  screen.getByText('Insert voter card to load ballot.')

  // ---------------

  // Voter Card which eventually expires
  const expiringCard = createVoterCard({
    c: utcTimestamp() - CARD_EXPIRATION_SECONDS + 5 * 60, // 5 minutes until expiration
  })

  // First Insert is Good
  card.insertCard(expiringCard)
  await advanceTimersAndPromises()
  fireEvent.click(screen.getByText('Start Voting'))

  // Slow voter clicks around, expiration Time passes, card still works.
  await advanceTimersAndPromises(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  fireEvent.click(screen.getByText('Next'))
  await advanceTimersAndPromises(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  fireEvent.click(screen.getByText('Next'))
  await advanceTimersAndPromises(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  fireEvent.click(screen.getByText('Next'))
  await advanceTimersAndPromises(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  fireEvent.click(screen.getByText('Next'))
  await advanceTimersAndPromises(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  fireEvent.click(screen.getByText('Next'))
  await advanceTimersAndPromises(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  fireEvent.click(screen.getByText('Next'))

  // Card expires, but card still works as expected.
  await advanceTimersAndPromises(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  fireEvent.click(screen.getByText('Next'))
  await advanceTimersAndPromises(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  fireEvent.click(screen.getByText('Next'))

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  screen.getByText('Insert voter card to load ballot.')

  // Reinsert expired card
  card.insertCard(getExpiredVoterCard())
  await advanceTimersAndPromises()
  screen.getByText('Expired Card')

  // Remove Card
  card.removeCard()
  await advanceTimersAndPromises()
  screen.getByText('Insert voter card to load ballot.')

  // ---------------
})

test('Inserting voter card when machine is unconfigured does nothing', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard()
  const hardware = await MemoryHardware.buildStandard()
  const storage = new MemoryStorage()
  const machineConfig = fakeMachineConfigProvider()

  card.removeCard()

  render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      machineConfig={machineConfig}
    />
  )
  await advanceTimersAndPromises()

  // ====================== END CONTEST SETUP ====================== //

  // Default Unconfigured
  screen.getByText('Device Not Configured')

  card.insertCard(getNewVoterCard())
  await advanceTimersAndPromises()

  screen.getByText('Device Not Configured')
})

test('Inserting pollworker card with invalid long data fall back as if there is no long data', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard()
  const hardware = await MemoryHardware.buildStandard()
  const storage = new MemoryStorage()
  const machineConfig = fakeMachineConfigProvider({ appMode: VxPrintOnly })

  card.removeCard()

  await setElectionInStorage(storage, electionSampleDefinition)
  await setStateInStorage(storage, {
    isPollsOpen: false,
    tally: getZeroTally(electionSampleDefinition.election),
  })

  render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      machineConfig={machineConfig}
    />
  )
  await advanceTimersAndPromises()

  // ====================== END CONTEST SETUP ====================== //

  screen.getByText('Insert Poll Worker card to open.')

  const pollworkerCard = pollWorkerCardForElection(election.electionHash)
  card.insertCard(pollworkerCard, electionSampleDefinition.electionData)
  await advanceTimersAndPromises()

  // Land on pollworker screen
  screen.getByText('Open/Close Polls')

  // Check that tally combination screen loads in the empty tally data state
  const tableRows = screen.getAllByTestId('tally-machine-row')
  expect(tableRows.length).toBe(1)
  within(tableRows[0]).getByText('000 (current machine)')
  within(tableRows[0]).getByText('Save to Card')
})
