import React from 'react'
import { fireEvent, render, wait } from '@testing-library/react'

import { Election } from '@votingworks/ballot-encoder'
import App from './App'

import { advanceTimers, getNewVoterCard } from '../test/helpers/smartcards'

import { setStateInStorage } from '../test/helpers/election'
import electionSample from './data/electionSample.json'
import { MemoryCard } from './utils/Card'
import { MemoryStorage } from './utils/Storage'
import { AppStorage, electionStorageKey } from './AppRoot'
import { MemoryHardware } from './utils/Hardware'
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
    } else {
      return contest
    }
  }),
}

jest.useFakeTimers()

beforeEach(() => {
  window.location.href = '/'
})

it('Single Seat Contest', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard()
  const hardware = MemoryHardware.standard
  const storage = new MemoryStorage<AppStorage>()
  const machineConfig = fakeMachineConfigProvider()

  storage.set(electionStorageKey, electionWithNoPartyCandidateContests)
  setStateInStorage(storage)

  const { container, getByText, queryByText } = render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      machineConfig={machineConfig}
    />
  )

  // Insert Voter Card
  card.insertCard(getNewVoterCard())
  advanceTimers()

  // Go to First Contest
  await wait(() => fireEvent.click(getByText('Start Voting')))
  advanceTimers()

  // ====================== END CONTEST SETUP ====================== //

  // eslint-disable-next-line no-restricted-syntax
  expect(queryByText('Federalist')).toEqual(null)
  // eslint-disable-next-line no-restricted-syntax
  expect(queryByText('Labor')).toEqual(null)
  // eslint-disable-next-line no-restricted-syntax
  expect(queryByText("People's")).toEqual(null)
  // eslint-disable-next-line no-restricted-syntax
  expect(queryByText('Liberty')).toEqual(null)
  // eslint-disable-next-line no-restricted-syntax
  expect(queryByText('Constitution')).toEqual(null)
  // eslint-disable-next-line no-restricted-syntax
  expect(queryByText('Whig')).toEqual(null)

  // Capture styles of Single Candidate Contest
  expect(container.firstChild).toMatchSnapshot()
})
