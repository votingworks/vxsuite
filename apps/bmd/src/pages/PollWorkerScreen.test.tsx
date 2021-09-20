import React from 'react'
import { asElectionDefinition } from '@votingworks/fixtures'
import { Election } from '@votingworks/types'

import { fireEvent, screen, waitFor } from '@testing-library/react'
import {
  getZeroTally,
  TallySourceMachineType,
  CardTally,
} from '@votingworks/utils'
import { PrecinctSelectionKind, VxMarkOnly, VxPrintOnly } from '../config/types'

import { render } from '../../test/testUtils'

import electionSampleWithSeal from '../data/electionSampleWithSeal.json'
import { defaultPrecinctId } from '../../test/helpers/election'

import PollWorkerScreen from './PollWorkerScreen'
import fakePrinter from '../../test/helpers/fakePrinter'
import fakeMachineConfig from '../../test/helpers/fakeMachineConfig'

jest.useFakeTimers()

test('renders PollWorkerScreen', async () => {
  const election = electionSampleWithSeal as Election
  render(
    <PollWorkerScreen
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      electionDefinition={asElectionDefinition(election)}
      enableLiveMode={jest.fn()}
      hasVotes={false}
      isLiveMode={false}
      isPollsOpen
      machineConfig={fakeMachineConfig({ appMode: VxMarkOnly })}
      printer={fakePrinter()}
      togglePollsOpen={jest.fn()}
      talliesOnCard={undefined}
      clearTalliesOnCard={jest.fn()}
    />
  )

  screen.getByText(/Polls are currently open./)
})

test('switching out of test mode on election day', async () => {
  const election = {
    ...electionSampleWithSeal,
    date: new Date().toISOString(),
  } as Election
  const enableLiveMode = jest.fn()
  render(
    <PollWorkerScreen
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      electionDefinition={asElectionDefinition(election)}
      enableLiveMode={enableLiveMode}
      hasVotes={false}
      isLiveMode={false}
      isPollsOpen
      machineConfig={fakeMachineConfig({ appMode: VxMarkOnly })}
      printer={fakePrinter()}
      togglePollsOpen={jest.fn()}
      talliesOnCard={undefined}
      clearTalliesOnCard={jest.fn()}
    />
  )

  screen.getByText('Switch to Live Election Mode?')
  fireEvent.click(screen.getByText('Switch to Live Mode'))
  expect(enableLiveMode).toHaveBeenCalled()
})

test('keeping test mode on election day', async () => {
  const election = {
    ...electionSampleWithSeal,
    date: new Date().toISOString(),
  } as Election
  const enableLiveMode = jest.fn()
  render(
    <PollWorkerScreen
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      electionDefinition={asElectionDefinition(election)}
      enableLiveMode={enableLiveMode}
      hasVotes={false}
      isLiveMode={false}
      isPollsOpen
      machineConfig={fakeMachineConfig({ appMode: VxMarkOnly })}
      printer={fakePrinter()}
      togglePollsOpen={jest.fn()}
      talliesOnCard={undefined}
      clearTalliesOnCard={jest.fn()}
    />
  )

  screen.getByText('Switch to Live Election Mode?')
  fireEvent.click(screen.getByText('Cancel'))
  expect(enableLiveMode).not.toHaveBeenCalled()
})

test('live mode on election day', async () => {
  const election = electionSampleWithSeal as Election
  const enableLiveMode = jest.fn()
  render(
    <PollWorkerScreen
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      electionDefinition={asElectionDefinition(election)}
      enableLiveMode={enableLiveMode}
      hasVotes={false}
      isLiveMode
      isPollsOpen
      machineConfig={fakeMachineConfig({ appMode: VxMarkOnly })}
      printer={fakePrinter()}
      togglePollsOpen={jest.fn()}
      talliesOnCard={undefined}
      clearTalliesOnCard={jest.fn()}
    />
  )

  expect(screen.queryByText('Switch to Live Election Mode?')).toBeNull()
})

test('printing precinct scanner report option is shown when precinct scanner tally data is on the card', async () => {
  const election = electionSampleWithSeal as Election
  const clearTallies = jest.fn()
  const printFn = jest.fn()

  const existingTally = getZeroTally(election)
  existingTally[0] = {
    candidates: [6, 5, 6, 5, 6, 0],
    undervotes: 6,
    overvotes: 0,
    writeIns: 0,
    ballotsCast: 34,
  }
  const talliesOnCard: CardTally = {
    tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
    tally: existingTally,
    totalBallotsScanned: 25,
    metadata: [
      {
        machineId: '001',
        timeSaved: new Date('2020-10-31').getTime(),
        ballotCount: 25,
      },
    ],
    isLiveMode: false,
    isPollsOpen: false,
    absenteeBallots: 5,
    precinctBallots: 20,
  }

  const currentTally = getZeroTally(election)
  currentTally[0] = {
    candidates: [1, 0, 1, 0, 1, 0],
    undervotes: 3,
    overvotes: 0,
    writeIns: 0,
    ballotsCast: 6,
  }

  render(
    <PollWorkerScreen
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      electionDefinition={asElectionDefinition(election)}
      enableLiveMode={jest.fn()}
      hasVotes={false}
      isLiveMode
      isPollsOpen={false}
      machineConfig={fakeMachineConfig({
        appMode: VxPrintOnly,
        machineId: '314',
      })}
      printer={{
        ...fakePrinter(),
        print: printFn,
      }}
      togglePollsOpen={jest.fn()}
      talliesOnCard={talliesOnCard}
      clearTalliesOnCard={clearTallies}
    />
  )

  screen.getByText('Tally Report on Card')
  fireEvent.click(screen.getByText('Print Tally Report'))

  await waitFor(() => {
    expect(clearTallies).toHaveBeenCalledTimes(1)
    expect(printFn).toHaveBeenCalledTimes(1)
  })
})
