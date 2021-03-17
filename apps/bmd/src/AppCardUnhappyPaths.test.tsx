import React from 'react'
import { render, fireEvent } from '@testing-library/react'

import App from './App'

import { CARD_EXPIRATION_SECONDS } from './config/globals'
import {
  advanceTimersAndPromises,
  getExpiredVoterCard,
  getOtherElectionVoterCard,
  getVoidedVoterCard,
  createVoterCard,
  getNewVoterCard,
} from '../test/helpers/smartcards'

import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election'
import utcTimestamp from './utils/utcTimestamp'
import { MemoryCard } from './utils/Card'
import { MemoryStorage } from './utils/Storage'
import { MemoryHardware } from './utils/Hardware'
import { fakeMachineConfigProvider } from '../test/helpers/fakeMachineConfig'

jest.useFakeTimers()

beforeEach(() => {
  window.location.href = '/'
})

test('Display App Card Unhappy Paths', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard()
  const hardware = MemoryHardware.standard
  const storage = new MemoryStorage()
  const machineConfig = fakeMachineConfigProvider()

  card.removeCard()

  setElectionInStorage(storage)
  setStateInStorage(storage)

  const { getByText } = render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      machineConfig={machineConfig}
    />
  )

  // ====================== END CONTEST SETUP ====================== //

  // Insert used Voter card
  card.insertCard(getOtherElectionVoterCard())
  await advanceTimersAndPromises()
  getByText('Card is not configured for this election.')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert voter card to load ballot.')

  // ---------------

  // Insert used Voter card
  card.insertCard(getVoidedVoterCard())
  await advanceTimersAndPromises()
  getByText('Expired Card')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert voter card to load ballot.')

  // ---------------

  // Insert expired Voter card
  card.insertCard(getExpiredVoterCard())
  await advanceTimersAndPromises()
  getByText('Expired Card')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert voter card to load ballot.')

  // ---------------

  // Voter Card which eventually expires
  const expiringCard = createVoterCard({
    c: utcTimestamp() - CARD_EXPIRATION_SECONDS + 5 * 60, // 5 minutes until expiration
  })

  // First Insert is Good
  card.insertCard(expiringCard)
  await advanceTimersAndPromises()
  fireEvent.click(getByText('Start Voting'))

  // Slow voter clicks around, expiration Time passes, card still works.
  await advanceTimersAndPromises(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  fireEvent.click(getByText('Next'))
  await advanceTimersAndPromises(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  fireEvent.click(getByText('Next'))
  await advanceTimersAndPromises(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  fireEvent.click(getByText('Next'))
  await advanceTimersAndPromises(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  fireEvent.click(getByText('Next'))
  await advanceTimersAndPromises(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  fireEvent.click(getByText('Next'))
  await advanceTimersAndPromises(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  fireEvent.click(getByText('Next'))

  // Card expires, but card still works as expected.
  await advanceTimersAndPromises(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  fireEvent.click(getByText('Next'))
  await advanceTimersAndPromises(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  fireEvent.click(getByText('Next'))

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert voter card to load ballot.')

  // Reinsert expired card
  card.insertCard(getExpiredVoterCard())
  await advanceTimersAndPromises()
  getByText('Expired Card')

  // Remove Card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert voter card to load ballot.')

  // ---------------
})

test('Inserting voter card when machine is unconfigured does nothing', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard()
  const hardware = MemoryHardware.standard
  const storage = new MemoryStorage()
  const machineConfig = fakeMachineConfigProvider()

  card.removeCard()

  const { getByText } = render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      machineConfig={machineConfig}
    />
  )

  // ====================== END CONTEST SETUP ====================== //

  // Default Unconfigured
  getByText('Device Not Configured')

  card.insertCard(getNewVoterCard())
  await advanceTimersAndPromises()

  getByText('Device Not Configured')
})
