import React from 'react'
import { asElectionDefinition } from '@votingworks/fixtures'
import { Election } from '@votingworks/types'

import {
  fireEvent,
  getByText as domGetByText,
  waitFor,
} from '@testing-library/react'
import { VxMarkOnly, VxPrintOnly } from '../config/types'

import { render } from '../../test/testUtils'

import electionSampleWithSeal from '../data/electionSampleWithSeal.json'
import { defaultPrecinctId } from '../../test/helpers/election'

import PollWorkerScreen from './PollWorkerScreen'
import { getZeroTally } from '../utils/election'
import fakePrinter from '../../test/helpers/fakePrinter'
import fakeMachineConfig from '../../test/helpers/fakeMachineConfig'
import { combineTallies } from '../utils/tallies'

jest.useFakeTimers()

test('renders PollWorkerScreen', async () => {
  const election = electionSampleWithSeal as Election
  const { getByText } = render(
    <PollWorkerScreen
      activateCardlessBallotStyleId={jest.fn()}
      appPrecinctId={defaultPrecinctId}
      ballotsPrintedCount={0}
      ballotStyleId=""
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
      activateCardlessBallotStyleId={jest.fn()}
      appPrecinctId={defaultPrecinctId}
      ballotsPrintedCount={0}
      ballotStyleId=""
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
      activateCardlessBallotStyleId={jest.fn()}
      appPrecinctId={defaultPrecinctId}
      ballotsPrintedCount={0}
      ballotStyleId=""
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

  getByText('Switch to Live Election Mode?')
  fireEvent.click(getByText('Cancel'))
  expect(enableLiveMode).not.toHaveBeenCalled()
})

test('live mode on election day', async () => {
  const election = electionSampleWithSeal as Election
  const enableLiveMode = jest.fn()
  const { queryByText } = render(
    <PollWorkerScreen
      activateCardlessBallotStyleId={jest.fn()}
      appPrecinctId={defaultPrecinctId}
      ballotsPrintedCount={0}
      ballotStyleId=""
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

  // eslint-disable-next-line no-restricted-syntax
  expect(queryByText('Switch to Live Election Mode?')).toBe(null)
})

test('results combination option is not shown for a non print machine', async () => {
  const election = electionSampleWithSeal as Election
  const enableLiveMode = jest.fn()
  const { queryByText } = render(
    <PollWorkerScreen
      activateCardlessBallotStyleId={jest.fn()}
      appPrecinctId={defaultPrecinctId}
      ballotsPrintedCount={0}
      ballotStyleId=""
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

  // eslint-disable-next-line no-restricted-syntax
  expect(queryByText('Combine Results Reports')).toBeNull()
})

test('results combination option is shown for a print machine', async () => {
  const election = electionSampleWithSeal as Election
  const saveTally = jest.fn()
  const clearTallies = jest.fn()
  const printFn = jest.fn()
  const { getByText, getAllByTestId } = render(
    <PollWorkerScreen
      activateCardlessBallotStyleId={jest.fn()}
      appPrecinctId={defaultPrecinctId}
      ballotsPrintedCount={0}
      ballotStyleId=""
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

  getByText('Combine Results Reports')
  const tableRows = getAllByTestId('tally-machine-row')
  expect(tableRows.length).toBe(1)
  expect(domGetByText(tableRows[0], '314 (current machine)'))
  fireEvent.click(getByText('Save to Card'))
  expect(saveTally).toHaveBeenCalledWith(
    expect.objectContaining({
      tally: getZeroTally(election),
      totalBallotsPrinted: 0,
      metadata: [expect.objectContaining({ machineId: '314' })],
    })
  )

  fireEvent.click(getByText('Print Combined Report for 1 Machine'))
  await waitFor(() => {
    getByText(
      /Do you want to print the combined results report from the 1 machine \(314\)/
    )
  })
  fireEvent.click(getByText('Print Report'))

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
    writeIns: [],
  }
  const talliesOnCard = {
    tally: existingTally,
    totalBallotsPrinted: 28,
    metadata: [
      {
        machineId: '001',
        timeSaved: new Date('2020-10-31').getTime(),
        ballotsPrinted: 3,
      },
      {
        machineId: '002',
        timeSaved: new Date('2020-10-30').getTime(),
        ballotsPrinted: 2,
      },
    ],
  }

  const currentTally = getZeroTally(election)
  currentTally[0] = {
    candidates: [1, 0, 1, 0, 1, 0],
    undervotes: 3,
    writeIns: [],
  }

  const { getByText, getAllByTestId } = render(
    <PollWorkerScreen
      activateCardlessBallotStyleId={jest.fn()}
      appPrecinctId={defaultPrecinctId}
      ballotsPrintedCount={3}
      ballotStyleId=""
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

  getByText('Combine Results Reports')
  const tableRows = getAllByTestId('tally-machine-row')
  expect(tableRows.length).toBe(3)
  expect(domGetByText(tableRows[0], '314 (current machine)'))
  expect(domGetByText(tableRows[1], '001'))
  expect(domGetByText(tableRows[2], '002'))
  fireEvent.click(getByText('Save to Card'))
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

  fireEvent.click(getByText('Print Combined Report for 3 Machines'))
  await waitFor(() => {
    getByText(
      /Do you want to print the combined results report from the 3 machines \(001, 002, 314\)/
    )
  })
  fireEvent.click(getByText('Print Report'))

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
    writeIns: [],
  }
  const talliesOnCard = {
    tally: existingTally,
    totalBallotsPrinted: 31,
    metadata: [
      {
        machineId: '001',
        timeSaved: new Date('2020-10-31').getTime(),
        ballotsPrinted: 2,
      },
      {
        machineId: '002',
        timeSaved: new Date('2020-10-30').getTime(),
        ballotsPrinted: 2,
      },
      {
        machineId: '314',
        timeSaved: new Date('2020-11-01').getTime(),
        ballotsPrinted: 2,
      },
    ],
  }

  const currentTally = getZeroTally(election)
  currentTally[0] = {
    candidates: [1, 0, 1, 0, 1, 0],
    undervotes: 3,
    writeIns: [],
  }

  const { getByText, getAllByTestId, queryByText } = render(
    <PollWorkerScreen
      activateCardlessBallotStyleId={jest.fn()}
      appPrecinctId={defaultPrecinctId}
      ballotsPrintedCount={3}
      ballotStyleId=""
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

  getByText('Combine Results Reports')
  const tableRows = getAllByTestId('tally-machine-row')
  expect(tableRows.length).toBe(3)
  expect(domGetByText(tableRows[0], '314 (current machine)'))
  expect(domGetByText(tableRows[1], '001'))
  expect(domGetByText(tableRows[2], '002'))
  expect(queryByText('Save to Card')).toBeNull()

  fireEvent.click(getByText('Print Combined Report for 3 Machines'))
  await waitFor(() => {
    getByText(
      /Do you want to print the combined results report from the 3 machines \(001, 002, 314\)/
    )
  })
  fireEvent.click(getByText('Close'))

  await waitFor(() => {
    expect(
      queryByText(/Do you want to print the combined results report/)
    ).toBeNull()
  })
})
