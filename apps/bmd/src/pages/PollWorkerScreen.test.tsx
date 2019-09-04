import React from 'react'
import fetchMock from 'fetch-mock'

import { Election } from '../config/types'

import { render } from '../../test/testUtils'

import electionSampleWithSeal from '../data/electionSampleWithSeal.json'

import {
  noCard,
  pollWorkerCard,
  advanceTimers,
} from '../../test/helpers/smartcards'

import PollWorkerScreen from './PollWorkerScreen'

jest.useFakeTimers()

let currentCard = noCard
fetchMock.get('/card/read', () => JSON.stringify(currentCard))

it('renders PollWorkerScreen', async () => {
  const { getByText } = render(
    <PollWorkerScreen
      ballotsPrintedCount={0}
      election={electionSampleWithSeal as Election}
      isPollsOpen
      isLiveMode={false}
      machineId="1"
      togglePollsOpen={jest.fn()}
    />
  )

  // Configure with Poll Worker  Card
  currentCard = pollWorkerCard
  advanceTimers()

  getByText('Polls are open.')
})
