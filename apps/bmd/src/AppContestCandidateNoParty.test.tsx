import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils'

import { Election } from '@votingworks/types'
import { asElectionDefinition } from '@votingworks/fixtures'
import App from './App'

import {
  advanceTimersAndPromises,
  getNewVoterCard,
} from '../test/helpers/smartcards'

import { setStateInStorage } from '../test/helpers/election'
import electionSample from './data/electionSample.json'
import { electionStorageKey } from './AppRoot'
import { fakeMachineConfigProvider } from '../test/helpers/fakeMachineConfig'

const election = electionSample as Election
const electionWithNoPartyCandidateContests: Election = {
  ...election,
  contests: election.contests.map((contest) => {
    if (contest.type === 'candidate') {
      const noPartyCandidateContest = {
        ...contest,
        candidates: contest.candidates.map((candidate) => ({
          ...candidate,
          partyId: undefined,
        })),
      }
      return noPartyCandidateContest
    }

    return contest
  }),
}

jest.useFakeTimers()

beforeEach(() => {
  window.location.href = '/'
})

it('Single Seat Contest', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard()
  const hardware = await MemoryHardware.buildStandard()
  const storage = new MemoryStorage()
  const machineConfig = fakeMachineConfigProvider()

  await storage.set(
    electionStorageKey,
    asElectionDefinition(electionWithNoPartyCandidateContests)
  )
  await setStateInStorage(storage)

  const { container } = render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      machineConfig={machineConfig}
    />
  )
  await advanceTimersAndPromises()

  // Insert Voter Card
  card.insertCard(getNewVoterCard())
  await advanceTimersAndPromises()

  // Go to First Contest
  fireEvent.click(screen.getByText('Start Voting'))
  await advanceTimersAndPromises()

  // ====================== END CONTEST SETUP ====================== //

  // eslint-disable-next-line no-restricted-syntax
  expect(screen.queryByText('Federalist')).toEqual(null)
  // eslint-disable-next-line no-restricted-syntax
  expect(screen.queryByText('Labor')).toEqual(null)
  // eslint-disable-next-line no-restricted-syntax
  expect(screen.queryByText("People's")).toEqual(null)
  // eslint-disable-next-line no-restricted-syntax
  expect(screen.queryByText('Liberty')).toEqual(null)
  // eslint-disable-next-line no-restricted-syntax
  expect(screen.queryByText('Constitution')).toEqual(null)
  // eslint-disable-next-line no-restricted-syntax
  expect(screen.queryByText('Whig')).toEqual(null)

  // Capture styles of Single Candidate Contest
  expect(container.firstChild).toMatchSnapshot()
})
