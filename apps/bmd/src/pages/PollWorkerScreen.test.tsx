import React from 'react'
import { Election } from '@votingworks/ballot-encoder'

import { fireEvent } from '@testing-library/react'
import { VxMarkOnly } from '../config/types'

import { render } from '../../test/testUtils'

import electionSampleWithSeal from '../data/electionSampleWithSeal.json'
import { defaultPrecinctId } from '../../test/helpers/election'

import PollWorkerScreen from './PollWorkerScreen'
import { getZeroTally } from '../utils/election'
import fakePrinter from '../../test/helpers/fakePrinter'
import fakeMachineConfig from '../../test/helpers/fakeMachineConfig'

jest.useFakeTimers()

test('renders PollWorkerScreen', async () => {
  const election = electionSampleWithSeal as Election
  const { getByText } = render(
    <PollWorkerScreen
      appPrecinctId={defaultPrecinctId}
      ballotsPrintedCount={0}
      electionDefinition={{ election, electionHash: 'test-hash' }}
      isPollsOpen
      isLiveMode={false}
      machineConfig={fakeMachineConfig({ appMode: VxMarkOnly })}
      printer={fakePrinter()}
      tally={getZeroTally(election)}
      togglePollsOpen={jest.fn()}
      enableLiveMode={jest.fn()}
    />
  )

  getByText(/Polls are currently open./)
})

test('switching out of test mode on election day', async () => {
  const election = {
    ...electionSampleWithSeal,
    date: new Date().toISOString(),
  } as Election
  const enableLiveMode = jest.fn()
  const { getByText } = render(
    <PollWorkerScreen
      appPrecinctId={defaultPrecinctId}
      ballotsPrintedCount={0}
      electionDefinition={{ election, electionHash: 'test-hash' }}
      isPollsOpen
      isLiveMode={false}
      machineConfig={fakeMachineConfig({ appMode: VxMarkOnly })}
      printer={fakePrinter()}
      tally={getZeroTally(election)}
      togglePollsOpen={jest.fn()}
      enableLiveMode={enableLiveMode}
    />
  )

  getByText('Switch to Live Election Mode?')
  fireEvent.click(getByText('Switch to Live Mode'))
  expect(enableLiveMode).toHaveBeenCalled()
})

test('keeping test mode on election day', async () => {
  const election = {
    ...electionSampleWithSeal,
    date: new Date().toISOString(),
  } as Election
  const enableLiveMode = jest.fn()
  const { getByText } = render(
    <PollWorkerScreen
      appPrecinctId={defaultPrecinctId}
      ballotsPrintedCount={0}
      electionDefinition={{ election, electionHash: 'test-hash' }}
      isPollsOpen
      isLiveMode={false}
      machineConfig={fakeMachineConfig({ appMode: VxMarkOnly })}
      printer={fakePrinter()}
      tally={getZeroTally(election)}
      togglePollsOpen={jest.fn()}
      enableLiveMode={enableLiveMode}
    />
  )

  getByText('Switch to Live Election Mode?')
  fireEvent.click(getByText('Cancel'))
  expect(enableLiveMode).not.toHaveBeenCalled()
})

test('live mode on election day', async () => {
  const election = electionSampleWithSeal as Election
  const enableLiveMode = jest.fn()
  const { queryByText } = render(
    <PollWorkerScreen
      appPrecinctId={defaultPrecinctId}
      ballotsPrintedCount={0}
      electionDefinition={{ election, electionHash: 'test-hash' }}
      isPollsOpen
      isLiveMode
      machineConfig={fakeMachineConfig({ appMode: VxMarkOnly })}
      printer={fakePrinter()}
      tally={getZeroTally(election)}
      togglePollsOpen={jest.fn()}
      enableLiveMode={enableLiveMode}
    />
  )

  // eslint-disable-next-line no-restricted-syntax
  expect(queryByText('Switch to Live Election Mode?')).toBe(null)
})
