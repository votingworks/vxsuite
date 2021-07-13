import React from 'react'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'

import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils'
import App from './App'

import withMarkup from '../test/helpers/withMarkup'

import {
  advanceTimers,
  getNewVoterCard,
  advanceTimersAndPromises,
} from '../test/helpers/smartcards'

import {
  singleSeatContestWithWriteIn,
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election'
import { VxMarkPlusVxPrint } from './config/types'
import fakePrinter from '../test/helpers/fakePrinter'
import { fakeMachineConfigProvider } from '../test/helpers/fakeMachineConfig'

jest.useFakeTimers()

beforeEach(() => {
  window.location.href = '/'
})

it('Single Seat Contest with Write In', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard()
  const printer = fakePrinter()
  const hardware = await MemoryHardware.buildStandard()
  const storage = new MemoryStorage()
  const machineConfig = fakeMachineConfigProvider({
    appMode: VxMarkPlusVxPrint,
  })

  await setElectionInStorage(storage)
  await setStateInStorage(storage)

  const { container } = render(
    <App
      card={card}
      hardware={hardware}
      printer={printer}
      storage={storage}
      machineConfig={machineConfig}
    />
  )
  await advanceTimersAndPromises()
  const getByTextWithMarkup = withMarkup(screen.getByText)

  const getWithinKeyboard = (text: string) =>
    within(screen.getByTestId('virtual-keyboard')).getByText(text)

  // Insert Voter Card
  card.insertCard(getNewVoterCard())
  await advanceTimersAndPromises()

  // Go to First Contest
  fireEvent.click(screen.getByText('Start Voting'))
  advanceTimers()

  // ====================== END CONTEST SETUP ====================== //

  // Advance to Single-Seat Contest with Write-In
  while (!screen.queryByText(singleSeatContestWithWriteIn.title)) {
    fireEvent.click(screen.getByText('Next'))
    advanceTimers()
  }

  // Test Write-In Candidate Modal Cancel
  fireEvent.click(screen.getByText('add write-in candidate').closest('button')!)
  fireEvent.click(screen.getByText('Cancel'))

  // Add Write-In Candidate
  fireEvent.click(screen.getByText('add write-in candidate').closest('button')!)
  expect(screen.getByText('Write-In Candidate')).toBeTruthy()
  // Capture styles of Single Candidate Contest
  expect(container.firstChild).toMatchSnapshot()

  // Enter Write-in Candidate Name
  fireEvent.click(getWithinKeyboard('B'))
  fireEvent.click(getWithinKeyboard('O'))
  fireEvent.click(getWithinKeyboard('V'))
  fireEvent.click(getWithinKeyboard('⌫ delete'))
  fireEvent.click(getWithinKeyboard('B'))
  fireEvent.click(screen.getByText('Accept'))
  advanceTimers()

  // Remove Write-In Candidate
  fireEvent.click(screen.getByText('BOB').closest('button')!)
  fireEvent.click(screen.getByText('Yes, Remove.'))
  advanceTimers()

  // Add Different Write-In Candidate
  fireEvent.click(screen.getByText('add write-in candidate').closest('button')!)
  fireEvent.click(getWithinKeyboard('S').closest('button')!)
  fireEvent.click(getWithinKeyboard('A').closest('button')!)
  fireEvent.click(getWithinKeyboard('L').closest('button')!)
  fireEvent.click(screen.getByText('Accept'))
  expect(screen.getByText('SAL').closest('button')!.dataset.selected).toBe(
    'true'
  )

  // Try to Select Other Candidate when max candidates are selected.
  fireEvent.click(
    screen
      .getByText(singleSeatContestWithWriteIn.candidates[0].name)
      .closest('button')!
  )
  screen.getByText(
    `You may only select ${singleSeatContestWithWriteIn.seats} candidate in this contest. To vote for ${singleSeatContestWithWriteIn.candidates[0].name}, you must first unselect the selected candidate.`
  )
  fireEvent.click(screen.getByText('Okay'))

  // Try to add another write-in when max candidates are selected.
  fireEvent.click(screen.getByText('add write-in candidate').closest('button')!)
  screen.getByText(
    `You may only select ${singleSeatContestWithWriteIn.seats} candidate in this contest. To vote for a write-in candidate, you must first unselect the selected candidate.`
  )
  fireEvent.click(screen.getByText('Okay'))

  // Go to review page and confirm write in exists
  while (!screen.queryByText('Review Your Votes')) {
    fireEvent.click(screen.getByText('Next'))
    advanceTimers()
  }

  // Review Screen
  await waitFor(() => screen.getByText('Review Your Votes'))
  expect(screen.getByText('SAL')).toBeTruthy()
  expect(screen.getByText('(write-in)')).toBeTruthy()

  // Print Screen
  fireEvent.click(getByTextWithMarkup('I’m Ready to Print My Ballot'))
  advanceTimers()
  expect(screen.getByText('Official Ballot')).toBeTruthy()
  expect(screen.getByText('(write-in)')).toBeTruthy()
  screen.getByText('Printing Official Ballot')

  // Trigger seal image loaded
  fireEvent.load(screen.getByTestId('printed-ballot-seal-image'))

  // Printer has new job
  await waitFor(() => expect(printer.print).toHaveBeenCalledTimes(1))
})
