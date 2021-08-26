import React from 'react'
import { asElectionDefinition } from '@votingworks/fixtures'
import { Election } from '@votingworks/types'

import {
  fireEvent,
  getByText as domGetByText,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  getZeroTally,
  combineTallies,
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
      ballotsPrintedCount={0}
      electionDefinition={asElectionDefinition(election)}
      enableLiveMode={jest.fn()}
      hasVotes={false}
      isLiveMode={false}
      isPollsOpen
      machineConfig={fakeMachineConfig({ appMode: VxMarkOnly })}
      printer={fakePrinter()}
      tally={getZeroTally(election)}
      togglePollsOpen={jest.fn()}
      saveTallyToCard={jest.fn()}
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
      ballotsPrintedCount={0}
      electionDefinition={asElectionDefinition(election)}
      enableLiveMode={enableLiveMode}
      hasVotes={false}
      isLiveMode={false}
      isPollsOpen
      machineConfig={fakeMachineConfig({ appMode: VxMarkOnly })}
      printer={fakePrinter()}
      tally={getZeroTally(election)}
      togglePollsOpen={jest.fn()}
      saveTallyToCard={jest.fn()}
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
      ballotsPrintedCount={0}
      electionDefinition={asElectionDefinition(election)}
      enableLiveMode={enableLiveMode}
      hasVotes={false}
      isLiveMode={false}
      isPollsOpen
      machineConfig={fakeMachineConfig({ appMode: VxMarkOnly })}
      printer={fakePrinter()}
      tally={getZeroTally(election)}
      togglePollsOpen={jest.fn()}
      saveTallyToCard={jest.fn()}
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
      ballotsPrintedCount={0}
      electionDefinition={asElectionDefinition(election)}
      enableLiveMode={enableLiveMode}
      hasVotes={false}
      isLiveMode
      isPollsOpen
      machineConfig={fakeMachineConfig({ appMode: VxMarkOnly })}
      printer={fakePrinter()}
      tally={getZeroTally(election)}
      togglePollsOpen={jest.fn()}
      saveTallyToCard={jest.fn()}
      talliesOnCard={undefined}
      clearTalliesOnCard={jest.fn()}
    />
  )

  expect(screen.queryByText('Switch to Live Election Mode?')).toBeNull()
})

test('results combination option is not shown for a non print machine', async () => {
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
      ballotsPrintedCount={0}
      electionDefinition={asElectionDefinition(election)}
      enableLiveMode={enableLiveMode}
      hasVotes={false}
      isLiveMode
      isPollsOpen={false}
      machineConfig={fakeMachineConfig({ appMode: VxMarkOnly })}
      printer={fakePrinter()}
      tally={getZeroTally(election)}
      togglePollsOpen={jest.fn()}
      saveTallyToCard={jest.fn()}
      talliesOnCard={undefined}
      clearTalliesOnCard={jest.fn()}
    />
  )

  expect(screen.queryByText('Combine Results Reports')).toBeNull()
})

test('results combination option is shown for a print machine', async () => {
  const election = electionSampleWithSeal as Election
  const saveTally = jest.fn()
  const clearTallies = jest.fn()
  const printFn = jest.fn()
  render(
    <PollWorkerScreen
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      ballotsPrintedCount={0}
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
      tally={getZeroTally(election)}
      togglePollsOpen={jest.fn()}
      saveTallyToCard={saveTally}
      talliesOnCard={undefined}
      clearTalliesOnCard={clearTallies}
    />
  )

  screen.getByText('Combine Results Reports')
  const tableRows = screen.getAllByTestId('tally-machine-row')
  expect(tableRows.length).toBe(1)
  expect(domGetByText(tableRows[0], '314 (current machine)'))
  fireEvent.click(screen.getByText('Save to Card'))
  expect(saveTally).toHaveBeenCalledWith(
    expect.objectContaining({
      tally: getZeroTally(election),
      totalBallotsPrinted: 0,
      metadata: [expect.objectContaining({ machineId: '314' })],
    })
  )

  fireEvent.click(screen.getByText('Print Combined Report for 1 Machine'))
  await waitFor(() => {
    screen.getByText(
      /Do you want to print the combined results report from the 1 machine \(314\)/
    )
  })
  fireEvent.click(screen.getByText('Print Report'))

  await waitFor(() => {
    expect(clearTallies).toHaveBeenCalledTimes(1)
    expect(printFn).toHaveBeenCalledTimes(1)
  })
})

test('results combination option is shown with prior tally results when provided', async () => {
  const election = electionSampleWithSeal as Election
  const saveTally = jest.fn()
  const clearTallies = jest.fn()
  const printFn = jest.fn()

  const existingTally = getZeroTally(election)
  existingTally[0] = {
    candidates: [5, 5, 5, 5, 5, 0],
    undervotes: 3,
    overvotes: 0,
    writeIns: 0,
    ballotsCast: 28,
  }
  const talliesOnCard: CardTally = {
    tally: existingTally,
    tallyMachineType: TallySourceMachineType.BMD,
    totalBallotsPrinted: 28,
    metadata: [
      {
        machineId: '001',
        timeSaved: new Date('2020-10-31').getTime(),
        ballotCount: 3,
      },
      {
        machineId: '002',
        timeSaved: new Date('2020-10-30').getTime(),
        ballotCount: 2,
      },
    ],
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
      ballotsPrintedCount={3}
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
      tally={currentTally}
      togglePollsOpen={jest.fn()}
      saveTallyToCard={saveTally}
      talliesOnCard={talliesOnCard}
      clearTalliesOnCard={clearTallies}
    />
  )

  screen.getByText('Combine Results Reports')
  const tableRows = screen.getAllByTestId('tally-machine-row')
  expect(tableRows.length).toBe(3)
  expect(domGetByText(tableRows[0], '314 (current machine)'))
  expect(domGetByText(tableRows[1], '001'))
  expect(domGetByText(tableRows[2], '002'))
  fireEvent.click(screen.getByText('Save to Card'))
  expect(saveTally).toHaveBeenCalledWith(
    expect.objectContaining({
      tally: combineTallies(election, existingTally, currentTally),
      totalBallotsPrinted: 31,
      metadata: expect.arrayContaining([
        ...talliesOnCard.metadata,
        expect.objectContaining({ machineId: '314' }),
      ]),
    })
  )

  fireEvent.click(screen.getByText('Print Combined Report for 3 Machines'))
  await waitFor(() => {
    screen.getByText(
      /Do you want to print the combined results report from the 3 machines \(001, 002, 314\)/
    )
  })
  fireEvent.click(screen.getByText('Print Report'))

  await waitFor(() => {
    expect(clearTallies).toHaveBeenCalledTimes(1)
    expect(printFn).toHaveBeenCalledTimes(1)
  })
})

test('results combination option is shown with prior tally results when results already have current machine saved', async () => {
  const election = electionSampleWithSeal as Election
  const saveTally = jest.fn()
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
    tally: existingTally,
    tallyMachineType: TallySourceMachineType.BMD,
    totalBallotsPrinted: 31,
    metadata: [
      {
        machineId: '001',
        timeSaved: new Date('2020-10-31').getTime(),
        ballotCount: 2,
      },
      {
        machineId: '002',
        timeSaved: new Date('2020-10-30').getTime(),
        ballotCount: 2,
      },
      {
        machineId: '314',
        timeSaved: new Date('2020-11-01').getTime(),
        ballotCount: 2,
      },
    ],
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
      ballotsPrintedCount={3}
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
      tally={currentTally}
      togglePollsOpen={jest.fn()}
      saveTallyToCard={saveTally}
      talliesOnCard={talliesOnCard}
      clearTalliesOnCard={clearTallies}
    />
  )

  screen.getByText('Combine Results Reports')
  const tableRows = screen.getAllByTestId('tally-machine-row')
  expect(tableRows.length).toBe(3)
  expect(domGetByText(tableRows[0], '314 (current machine)'))
  expect(domGetByText(tableRows[1], '001'))
  expect(domGetByText(tableRows[2], '002'))
  expect(screen.queryByText('Save to Card')).toBeNull()

  fireEvent.click(screen.getByText('Print Combined Report for 3 Machines'))
  await waitFor(() => {
    screen.getByText(
      /Do you want to print the combined results report from the 3 machines \(001, 002, 314\)/
    )
  })
  fireEvent.click(screen.getByText('Close'))

  await waitFor(() => {
    expect(
      screen.queryByText(/Do you want to print the combined results report/)
    ).toBeNull()
  })
})

test('printing precinct scanner report option is shown when precinct scanner tally data is on the card', async () => {
  const election = electionSampleWithSeal as Election
  const saveTally = jest.fn()
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
      ballotsPrintedCount={3}
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
      tally={currentTally}
      togglePollsOpen={jest.fn()}
      saveTallyToCard={saveTally}
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
