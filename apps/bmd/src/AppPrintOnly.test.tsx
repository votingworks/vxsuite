import React from 'react'
import { fireEvent, render, wait, within } from '@testing-library/react'
import {
  electionSample,
  encodeBallot,
  BallotType,
} from '@votingworks/ballot-encoder'

import App from './App'

import {
  adminCard,
  advanceTimers,
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

beforeEach(() => {
  window.location.href = '/'
})

jest.useFakeTimers()
jest.setTimeout(20000) // TODO: Added after hardware polling added. Why?

it('VxPrintOnly flow', async () => {
  const card = new MemoryCard()
  const printer = fakePrinter()
  const hardware = new MemoryHardware()
  const storage = new MemoryStorage<AppStorage>()
  const { getAllByText, getByLabelText, getByText, getByTestId } = render(
    <App card={card} hardware={hardware} storage={storage} printer={printer} />
  )

  const getAllByTextWithMarkup = withMarkup(getAllByText)

  card.removeCard()
  advanceTimers()

  // Default Unconfigured
  getByText('Device Not Configured')

  // ---------------

  // Configure with Admin Card
  card.insertCard(adminCard, electionSample)
  advanceTimers()
  await wait(() => fireEvent.click(getByText('Load Election Definition')))

  advanceTimers()
  await wait(() => getByText('Election definition is loaded.'))

  fireEvent.click(getByText('VxPrint Only'))
  expect((getByText('VxPrint Only') as HTMLButtonElement).disabled).toBeTruthy()

  fireEvent.click(getByText('Live Election Mode'))
  expect(
    (getByText('Live Election Mode') as HTMLButtonElement).disabled
  ).toBeTruthy()

  // Remove card
  card.removeCard()
  advanceTimers()
  await wait(() => getByText('Device Not Configured'))

  // ---------------

  // Configure election with Admin Card
  card.insertCard(adminCard, electionSample)
  advanceTimers()
  await wait(() => getByLabelText('Precinct'))

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
  advanceTimers()
  await wait(() => getByText('Polls Closed'))
  getByText('Insert Poll Worker card to open.')

  // ---------------

  // Open Polls with Poll Worker Card
  card.insertCard(pollWorkerCard)
  advanceTimers()
  await wait(() =>
    fireEvent.click(getByText('Open Polls for Center Springfield'))
  )
  getByText('Open polls and print Polls Opened report?')
  fireEvent.click(within(getByTestId('modal')).getByText('Yes'))
  await wait(() => getByText('Close Polls for Center Springfield'))
  expect(printer.print).toHaveBeenCalledTimes(1)

  // Remove card
  card.removeCard()
  advanceTimers()
  await wait(() => getByText('Insert Card'))

  // ---------------

  // Insert Expired Voter Card
  card.insertCard(getExpiredVoterCard())
  advanceTimers()
  await wait(() => getByText('Expired Card'))

  // Remove card
  card.removeCard()
  advanceTimers()
  await wait(() => getByText('Insert Card'))

  // ---------------

  // Insert Used Voter Card
  card.insertCard(getUsedVoterCard())
  advanceTimers()
  await wait(() => getByText('Used Card'))

  // Remove card
  card.removeCard()
  advanceTimers()
  await wait(() => getByText('Insert Card'))

  // ---------------

  // Insert Voter Card with No Votes
  card.insertCard(getNewVoterCard())
  advanceTimers()
  await wait(() => getByText('Empty Card'))

  // Remove card
  card.removeCard()
  advanceTimers()
  await wait(() => getByText('Insert Card'))

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
  advanceTimers()
  await wait() // TODO: unsure why this `wait` is needed, but it is.
  getByText('Printing your official ballot')

  // After timeout, show Verify and Cast Instructions
  advanceTimers(printerMessageTimeoutSeconds)
  await wait(() => getByText('Verify and Cast Your Printed Ballot'))
  expect(printer.print).toHaveBeenCalledTimes(2)

  // Remove card
  card.removeCard()
  advanceTimers()
  await wait(() => getByText('Insert Card'))

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
  advanceTimers()
  await wait() // TODO: unsure why this `wait` is needed, but it is.
  getByText('Printing your official ballot')

  // After timeout, show Verify and Cast Instructions
  advanceTimers(printerMessageTimeoutSeconds)
  await wait(() => getByText('Verify and Cast Your Printed Ballot'))
  expect(printer.print).toHaveBeenCalledTimes(3)

  // Remove card
  card.removeCard()
  advanceTimers()
  await wait(() => getByText('Insert Card'))

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
  advanceTimers()
  await wait() // TODO: unsure why this `wait` is needed, but it is.
  getByText('Printing your official ballot')

  // After timeout, show Verify and Cast Instructions
  advanceTimers(printerMessageTimeoutSeconds)
  await wait(() => getByText('Verify and Cast Your Printed Ballot'))
  expect(printer.print).toHaveBeenCalledTimes(4)

  // Remove card
  card.removeCard()
  advanceTimers()
  await wait(() => getByText('Insert Card'))

  // ---------------

  // Pollworker Closes Polls
  card.insertCard(pollWorkerCard)
  advanceTimers()
  await wait(() => getByText('Close Polls for Center Springfield'))

  // Check for Report Details
  expect(getAllByTextWithMarkup('Ballots printed count: 3').length).toBe(2)
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
  await wait(() => getByText('Open Polls for Center Springfield'))
  expect(printer.print).toHaveBeenCalledTimes(5)

  // Remove card
  card.removeCard()
  advanceTimers()
  await wait(() => getByText('Insert Poll Worker card to open.'))

  // ---------------

  // Unconfigure with Admin Card
  card.insertCard(adminCard, electionSample)
  advanceTimers()
  await wait(() => getByText('Election definition is loaded.'))
  fireEvent.click(getByText('Remove'))
  advanceTimers()

  // Default Unconfigured
  getByText('Device Not Configured')
})
