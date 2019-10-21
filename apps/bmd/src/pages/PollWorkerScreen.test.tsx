import React from 'react'
import fetchMock from 'fetch-mock'
import { Election } from '@votingworks/ballot-encoder'

import { VxMarkOnly } from '../config/types'

import { render } from '../../test/testUtils'

import electionSampleWithSeal from '../data/electionSampleWithSeal.json'
import { defaultPrecinctId } from '../../test/helpers/election'

import {
  advanceTimers,
  noCard,
  pollWorkerCard,
} from '../../test/helpers/smartcards'

import PollWorkerScreen from './PollWorkerScreen'
import { NullPrinter } from '../utils/printer'
import { getZeroTally } from '../utils/election'

jest.useFakeTimers()

let currentCard = noCard
fetchMock.get('/card/read', () => JSON.stringify(currentCard))

it('renders PollWorkerScreen', async () => {
  const election = electionSampleWithSeal as Election
  const { getByText } = render(
    <PollWorkerScreen
      appMode={VxMarkOnly}
      appPrecinctId={defaultPrecinctId}
      ballotsPrintedCount={0}
      election={election}
      isPollsOpen
      isLiveMode={false}
      machineId="1"
      printer={new NullPrinter()}
      tally={getZeroTally(election)}
      togglePollsOpen={jest.fn()}
    />
  )

  // Configure with Poll Worker  Card
  currentCard = pollWorkerCard
  advanceTimers()

  getByText('Polls are currently open.')
})
