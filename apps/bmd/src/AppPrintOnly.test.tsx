import React from 'react'
import { fireEvent, render, within } from '@testing-library/react'
import {
  electionSample,
  encodeBallot,
  BallotType,
} from '@votingworks/ballot-encoder'

import App from './App'

import {
  adminCard,
  advanceTimersAndPromises,
  getExpiredVoterCard,
  getNewVoterCard,
  getUsedVoterCard,
  pollWorkerCard,
  sampleVotes1,
  sampleVotes2,
  sampleVotes3,
  createVoterCard,
} from '../test/helpers/smartcards'

import withMarkup from '../test/helpers/withMarkup'

import { printerMessageTimeoutSeconds } from './pages/PrintOnlyScreen'
import { MemoryStorage } from './utils/Storage'
import { AppStorage } from './AppRoot'
import { MemoryCard } from './utils/Card'
import fakePrinter from '../test/helpers/fakePrinter'
import { MemoryHardware } from './utils/Hardware'
import { fakeMachineConfigProvider } from '../test/helpers/fakeMachineConfig'
import { REPORT_PRINTING_TIMEOUT_SECONDS } from './config/globals'
import { VxPrintOnly } from './config/types'
import { mockOf } from '../test/testUtils'

beforeEach(() => {
  window.location.href = '/'
})

jest.useFakeTimers()

jest.setTimeout(10000)

test('VxPrintOnly flow', async () => {
  const card = new MemoryCard()
  const printer = fakePrinter()
  const hardware = MemoryHardware.standard
  const storage = new MemoryStorage<AppStorage>()
  const machineConfig = fakeMachineConfigProvider({ appMode: VxPrintOnly })
  const { getAllByText, getByLabelText, getByText, getByTestId } = render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      printer={printer}
      machineConfig={machineConfig}
    />
  )

  const getAllByTextWithMarkup = withMarkup(getAllByText)

  card.removeCard()
  await advanceTimersAndPromises()

  // Default Unconfigured
  getByText('Device Not Configured')

  // ---------------

  // Configure with Admin Card
  card.insertCard(adminCard, electionSample)
  await advanceTimersAndPromises()
  fireEvent.click(getByText('Load Election Definition'))

  await advanceTimersAndPromises()
  getByText('Election definition is loaded.')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Device Not Configured')

  // ---------------

  // Configure election with Admin Card
  card.insertCard(adminCard, electionSample)
  await advanceTimersAndPromises()
  getByLabelText('Precinct')

  // Select precinct
  getByText('State of Hamilton')
  const precinctSelect = getByLabelText('Precinct')
  const precinctId = (within(precinctSelect).getByText(
    'Center Springfield'
  ) as HTMLOptionElement).value
  fireEvent.change(precinctSelect, { target: { value: precinctId } })
  within(getByTestId('election-info')).getByText('Center Springfield')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Polls Closed')
  getByText('Insert Poll Worker card to open.')

  // ---------------

  // Open Polls in Testing Mode with Poll Worker Card
  card.insertCard(pollWorkerCard)
  await advanceTimersAndPromises()
  fireEvent.click(getByText('Open Polls for Center Springfield'))
  getByText('Open polls and print Polls Opened report?')
  fireEvent.click(within(getByTestId('modal')).getByText('Yes'))
  await advanceTimersAndPromises()
  getByText('Printing Polls Opened report for Center Springfield')
  await advanceTimersAndPromises(REPORT_PRINTING_TIMEOUT_SECONDS)
  getByText('Close Polls for Center Springfield')
  expect(printer.print).toHaveBeenCalledTimes(1)

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert Card')

  // ---------------

  // Test for Testing Mode
  getByText('Testing Mode')

  // ---------------

  // Set to Live Mode
  card.insertCard(adminCard, electionSample)
  await advanceTimersAndPromises()

  fireEvent.click(getByText('Live Election Mode'))
  expect(
    (getByText('Live Election Mode') as HTMLButtonElement).disabled
  ).toBeTruthy()

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Polls Closed')
  getByText('Insert Poll Worker card to open.')

  // ---------------

  // Open Polls with Poll Worker Card
  card.insertCard(pollWorkerCard)
  await advanceTimersAndPromises()
  fireEvent.click(getByText('Open Polls for Center Springfield'))
  getByText('Open polls and print Polls Opened report?')
  fireEvent.click(within(getByTestId('modal')).getByText('Yes'))
  await advanceTimersAndPromises()
  getByText('Printing Polls Opened report for Center Springfield')
  await advanceTimersAndPromises(REPORT_PRINTING_TIMEOUT_SECONDS)
  getByText('Close Polls for Center Springfield')
  expect(printer.print).toHaveBeenCalledTimes(2)

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert Card')

  // Check Printed Ballots Count
  getAllByTextWithMarkup('Ballots Printed: 0')

  // ---------------

  // Insert Expired Voter Card
  card.insertCard(getExpiredVoterCard())
  await advanceTimersAndPromises()
  getByText('Expired Card')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert Card')

  // ---------------

  // Insert Used Voter Card
  card.insertCard(getUsedVoterCard())
  await advanceTimersAndPromises()
  getByText('Used Card')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert Card')

  // ---------------

  // Insert Voter Card with No Votes
  card.insertCard(getNewVoterCard())
  await advanceTimersAndPromises()
  getByText('Empty Card')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert Card')

  // ---------------

  // Voter 1 Prints Ballot
  card.insertCard(
    createVoterCard(),
    encodeBallot({
      election: electionSample,
      ballotId: 'test-ballot-id',
      ballotStyle: electionSample.ballotStyles[0],
      precinct: electionSample.precincts[0],
      votes: sampleVotes1,
      isTestBallot: true,
      ballotType: BallotType.Standard,
    })
  )

  // Show Printing Ballot screen
  await advanceTimersAndPromises()
  getByText('Printing your official ballot')

  // After timeout, show Verify and Cast Instructions
  await advanceTimersAndPromises(printerMessageTimeoutSeconds)
  getByText('Verify and Cast Your Printed Ballot')
  expect(printer.print).toHaveBeenCalledTimes(3)

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert Card')

  // Check Printed Ballots Count
  getAllByTextWithMarkup('Ballots Printed: 1')

  // ---------------

  // Voter 2 Prints Ballot
  card.insertCard(
    createVoterCard(),
    encodeBallot({
      election: electionSample,
      ballotId: 'test-ballot-id',
      ballotStyle: electionSample.ballotStyles[0],
      precinct: electionSample.precincts[0],
      votes: sampleVotes2,
      isTestBallot: true,
      ballotType: BallotType.Standard,
    })
  )

  // Show Printing Ballot screen
  await advanceTimersAndPromises()
  getByText('Printing your official ballot')

  // After timeout, show Verify and Cast Instructions
  await advanceTimersAndPromises(printerMessageTimeoutSeconds)
  getByText('Verify and Cast Your Printed Ballot')
  expect(printer.print).toHaveBeenCalledTimes(4)

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert Card')

  // Check Printed Ballots Count
  getAllByTextWithMarkup('Ballots Printed: 2')

  // ---------------

  // Voter 3 Prints Ballot
  card.insertCard(
    createVoterCard(),
    encodeBallot({
      election: electionSample,
      ballotId: 'test-ballot-id',
      ballotStyle: electionSample.ballotStyles[0],
      precinct: electionSample.precincts[0],
      votes: sampleVotes3,
      isTestBallot: true,
      ballotType: BallotType.Standard,
    })
  )

  // Show Printing Ballot screen
  await advanceTimersAndPromises()
  getByText('Printing your official ballot')

  // After timeout, show Verify and Cast Instructions
  await advanceTimersAndPromises(printerMessageTimeoutSeconds)
  getByText('Verify and Cast Your Printed Ballot')
  expect(printer.print).toHaveBeenCalledTimes(5)

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert Card')

  // Check Printed Ballots Count
  getAllByTextWithMarkup('Ballots Printed: 3')

  // Blank Ballot, i.e. a ballot that deliberately is left empty by the voter, should still print
  card.insertCard(
    createVoterCard(),
    encodeBallot({
      election: electionSample,
      ballotId: 'test-ballot-id',
      ballotStyle: electionSample.ballotStyles[0],
      precinct: electionSample.precincts[0],
      votes: {},
      isTestBallot: true,
      ballotType: BallotType.Standard,
    })
  )

  // Show Printing Ballot screen
  await advanceTimersAndPromises()
  getByText('Printing your official ballot')

  expect(getAllByTextWithMarkup('[no selection]')).toHaveLength(20)

  // After timeout, show Verify and Cast Instructions
  await advanceTimersAndPromises(printerMessageTimeoutSeconds)
  getByText('Verify and Cast Your Printed Ballot')
  expect(printer.print).toHaveBeenCalledTimes(6)

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert Card')

  // Check Printed Ballots Count
  getAllByTextWithMarkup('Ballots Printed: 4')

  // ---------------

  // Pollworker Closes Polls
  card.insertCard(pollWorkerCard)
  await advanceTimersAndPromises()
  getByText('Close Polls for Center Springfield')

  // Check for Report Details
  expect(getAllByTextWithMarkup('Ballots printed count: 4').length).toBe(2)
  expect(getAllByTextWithMarkup('Edward Shiplett').length).toBe(2)

  expect(getAllByText('Edward Shiplett')[0].nextSibling!.textContent).toBe('3')
  expect(getAllByText('Rhadka Ramachandrani')[0].nextSibling!.textContent).toBe(
    '1'
  )
  expect(getAllByText('Laila Shamsi')[0].nextSibling!.textContent).toBe('2')
  expect(getAllByText('Marty Talarico')[0].nextSibling!.textContent).toBe('1')

  expect(
    getAllByText('State of Hamilton, Question B: Separation of Powers')[0]
      .nextSibling!.textContent
  ).toBe('Yes2No1')
  expect(
    getAllByText(
      'Hamilton Court of Appeals, Retain Robert Demergue as Chief Justice?'
    )[0].nextSibling!.textContent
  ).toBe('Yes2No1')
  expect(
    getAllByText('Franklin County, Measure 666: The Question No One Gets To')[0]
      .nextSibling!.textContent
  ).toBe('YesXNoX')
  expect(
    getAllByText('Franklin County, Head of Constitution Party')[0].nextSibling!
      .textContent
  ).toBe('Alice JonesXBob SmithX')

  // Close Polls
  fireEvent.click(getByText('Close Polls for Center Springfield'))
  getByText('Close Polls and print Polls Closed report?')
  fireEvent.click(within(getByTestId('modal')).getByText('Yes'))
  await advanceTimersAndPromises()
  getByText('Printing Polls Closed report for Center Springfield')
  await advanceTimersAndPromises(REPORT_PRINTING_TIMEOUT_SECONDS)
  getByText('Open Polls for Center Springfield')
  expect(printer.print).toHaveBeenCalledTimes(7)

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert Poll Worker card to open.')

  // ---------------

  // Unconfigure with Admin Card
  card.insertCard(adminCard, electionSample)
  await advanceTimersAndPromises()
  getByText('Election definition is loaded.')
  fireEvent.click(getByText('Remove'))
  await advanceTimersAndPromises()

  // Default Unconfigured
  getByText('Device Not Configured')
})

test('VxPrint retains app mode when unconfigured', async () => {
  const card = new MemoryCard()
  const printer = fakePrinter()
  const hardware = MemoryHardware.standard
  const storage = new MemoryStorage<AppStorage>()
  const machineConfig = fakeMachineConfigProvider({ appMode: VxPrintOnly })
  const { getByLabelText, getByText, getByTestId } = render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      printer={printer}
      machineConfig={machineConfig}
    />
  )

  await advanceTimersAndPromises()

  async function configure(): Promise<void> {
    // Configure with Admin Card
    card.insertCard(adminCard, electionSample)
    await advanceTimersAndPromises()
    fireEvent.click(getByText('Load Election Definition'))

    await advanceTimersAndPromises()
    getByText('Election definition is loaded.')

    // Select precinct
    getByText('State of Hamilton')
    const precinctSelect = getByLabelText('Precinct')
    const precinctId = (within(precinctSelect).getByText(
      'Center Springfield'
    ) as HTMLOptionElement).value
    fireEvent.change(precinctSelect, { target: { value: precinctId } })
    within(getByTestId('election-info')).getByText('Center Springfield')

    // Remove card
    card.removeCard()
    await advanceTimersAndPromises()
    getByText('Polls Closed')
    getByText('Insert Poll Worker card to open.')
  }

  // Open Polls with Poll Worker Card
  async function openPolls(): Promise<void> {
    const currentPrintCallCount = mockOf(printer.print).mock.calls.length

    card.insertCard(pollWorkerCard)
    await advanceTimersAndPromises()
    fireEvent.click(getByText('Open Polls for Center Springfield'))
    await advanceTimersAndPromises()
    getByText('Open polls and print Polls Opened report?')
    fireEvent.click(within(getByTestId('modal')).getByText('Yes'))
    await advanceTimersAndPromises()
    getByText('Printing Polls Opened report for Center Springfield')
    await advanceTimersAndPromises(REPORT_PRINTING_TIMEOUT_SECONDS)
    getByText('Close Polls for Center Springfield')
    expect(printer.print).toHaveBeenCalledTimes(currentPrintCallCount + 1)

    // Remove card
    card.removeCard()
    await advanceTimersAndPromises()
  }

  async function unconfigure(): Promise<void> {
    // Unconfigure with Admin Card
    card.insertCard(adminCard, electionSample)
    await advanceTimersAndPromises()
    getByText('Election definition is loaded.')
    fireEvent.click(getByText('Remove'))
    await advanceTimersAndPromises()

    // Default Unconfigured
    getByText('Device Not Configured')

    // Remove card
    card.removeCard()
    await advanceTimersAndPromises()
  }

  // ---------------

  // Default Unconfigured
  getByText('Device Not Configured')

  // Do the initial configuration & open polls.
  await configure()
  await openPolls()

  // Make sure we're ready to print ballots.
  getByText('Insert Card to print your official ballot.')

  // Remove election configuration.
  await unconfigure()

  // Re-configure & open polls again.
  await configure()
  await openPolls()

  // Make sure we're again ready to print ballots.
  getByText('Insert Card to print your official ballot.')
})
