import React from 'react'
import { fireEvent, render, waitFor, within } from '@testing-library/react'
import { advanceBy } from 'jest-date-mock'
import * as GLOBALS from './config/globals'

import { electionSampleDefinition } from './data'

import App from './App'

import withMarkup from '../test/helpers/withMarkup'

import {
  adminCardForElection,
  advanceTimersAndPromises,
  getAlternateNewVoterCard,
  getNewVoterCard,
  getUsedVoterCard,
  pollWorkerCardForElection,
  getInvalidPollWorkerCard,
} from '../test/helpers/smartcards'

import {
  presidentContest,
  countyCommissionersContest,
  measure102Contest,
  measure420Contest,
  voterContests,
} from '../test/helpers/election'
import { MemoryStorage } from './utils/Storage'
import { MemoryCard } from './utils/Card'
import fakePrinter from '../test/helpers/fakePrinter'
import { MemoryHardware } from './utils/Hardware'
import { fakeMachineConfigProvider } from '../test/helpers/fakeMachineConfig'
import { REPORT_PRINTING_TIMEOUT_SECONDS } from './config/globals'
import { VxMarkPlusVxPrint } from './config/types'

beforeEach(() => {
  window.location.href = '/'
})

jest.useFakeTimers()
jest.setTimeout(15000)

it('VxMark+Print end-to-end flow', async () => {
  const electionDefinition = electionSampleDefinition
  const card = new MemoryCard()
  const hardware = MemoryHardware.standard
  const printer = fakePrinter()
  const storage = new MemoryStorage()
  const machineConfig = fakeMachineConfigProvider({
    appMode: VxMarkPlusVxPrint,
  })
  const expectedElectionHash = electionDefinition.electionHash.substring(0, 10)
  const writeLongUint8ArrayMock = jest.spyOn(card, 'writeLongUint8Array')
  const { getByLabelText, getByText, getByTestId, queryByText } = render(
    <App
      card={card}
      hardware={hardware}
      machineConfig={machineConfig}
      printer={printer}
      storage={storage}
    />
  )
  const adminCard = adminCardForElection(electionDefinition.electionHash)
  const pollWorkerCard = pollWorkerCardForElection(
    electionDefinition.electionHash
  )
  const invalidPollWorkerCard = getInvalidPollWorkerCard()
  const getByTextWithMarkup = withMarkup(getByText)

  card.removeCard()
  await advanceTimersAndPromises()

  // Default Unconfigured
  getByText('Device Not Configured')

  // ---------------

  // Configure with Admin Card
  card.insertCard(adminCard, electionDefinition.electionData)
  await advanceTimersAndPromises()
  fireEvent.click(getByText('Load Election Definition'))

  await advanceTimersAndPromises()
  getByText('Election definition is loaded.')

  // Remove card and expect not configured because precinct not selected
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Device Not Configured')

  // ---------------

  // Configure election with Admin Card
  card.insertCard(adminCard, electionDefinition.electionData)
  await advanceTimersAndPromises()
  getByLabelText('Precinct')
  within(getByTestId('election-info')).getByText(
    `Election ID: ${expectedElectionHash}`
  )
  within(getByTestId('election-info')).getByText(/Machine ID: 000/)

  // Select precinct
  getByText('State of Hamilton')
  const precinctSelect = getByLabelText('Precinct')
  const precinctId = (within(precinctSelect).getByText(
    'Center Springfield'
  ) as HTMLOptionElement).value
  fireEvent.change(precinctSelect, { target: { value: precinctId } })
  within(getByTestId('election-info')).getByText('Center Springfield')

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

  // Using an invalid Poll Worker Card shows an error
  card.insertCard(invalidPollWorkerCard)
  await advanceTimersAndPromises()
  getByText('Invalid Card Data')
  getByText('Card is not configured for this election.')
  getByText('Please ask admin for assistance.')
  card.removeCard()

  // Open Polls with Poll Worker Card
  card.insertCard(pollWorkerCard)
  await advanceTimersAndPromises()
  within(getByTestId('election-info')).getByText(
    `Election ID: ${expectedElectionHash}`
  )
  fireEvent.click(getByText('Open Polls for Center Springfield'))
  fireEvent.click(within(getByTestId('modal')).getByText('Cancel'))
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
  await waitFor(() => getByText('Insert voter card to load ballot.'))

  // ---------------

  // Voter partially votes, remove card, and is on insert card screen.
  card.insertCard(getNewVoterCard())
  await advanceTimersAndPromises()
  await waitFor(() => getByText(/Center Springfield/))
  expect(queryByText(expectedElectionHash)).toBeNull()
  expect(
    within(getByTestId('election-info')).queryByText(
      `Election ID: ${expectedElectionHash}`
    )
  ).toBeNull()
  getByText(/ballot style 12/)
  getByTextWithMarkup('Your ballot has 21 contests.')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  await waitFor(() => getByText('Insert voter card to load ballot.'))

  // ---------------

  // Alternate Precinct
  card.insertCard(getAlternateNewVoterCard())
  await advanceTimersAndPromises()
  getByText('Invalid Card Data')
  getByText('Card is not configured for this precinct.')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert voter card to load ballot.')

  // ---------------

  // Complete Voter Happy Path

  // Insert Voter card
  card.insertCard(getNewVoterCard())
  await advanceTimersAndPromises()
  getByText(/Center Springfield/)
  getByText(/ballot style 12/)
  expect(
    within(getByTestId('election-info')).queryByText(
      `Election ID: ${expectedElectionHash}`
    )
  ).toBeNull()
  getByTextWithMarkup('Your ballot has 21 contests.')

  // Adjust Text Size
  const changeTextSize = within(getByTestId('change-text-size-buttons'))
  const textSizeButtons = changeTextSize.getAllByText('A')
  expect(textSizeButtons.length).toBe(3)
  fireEvent.click(textSizeButtons[0]) // html element has new font size
  expect(window.document.documentElement.style.fontSize).toBe('22px')
  fireEvent.click(textSizeButtons[1]) // html element has default font size
  expect(window.document.documentElement.style.fontSize).toBe('28px')
  fireEvent.click(textSizeButtons[2]) // html element has default font size
  expect(window.document.documentElement.style.fontSize).toBe('36px')

  // Start Voting
  fireEvent.click(getByText('Start Voting'))

  // Initial empty votes written to the card after tapping "Start Voting".
  await advanceTimersAndPromises()
  expect(writeLongUint8ArrayMock).toHaveBeenCalledTimes(1)

  // Advance through every contest
  for (let i = 0; i < voterContests.length; i++) {
    const { title } = voterContests[i]

    await advanceTimersAndPromises()
    getByText(title)
    expect(
      within(getByTestId('election-info')).queryByText(
        `Election ID: ${expectedElectionHash}`
      )
    ).toBeNull()

    // Vote for candidate contest
    if (title === presidentContest.title) {
      fireEvent.click(getByText(presidentContest.candidates[0].name))

      // We write to the card when no changes to the ballot state have happened for a second.
      // To test that this is happening, we advance time by a bit more than a second
      // We also need to advance timers so the interval will run, see that time has passed,
      // and finally write to the card.
      advanceBy(1100)
      await advanceTimersAndPromises()
      expect(writeLongUint8ArrayMock).toHaveBeenCalledTimes(2)

      // If we wait another second and advance timers, without any change made to the card,
      // we should not see another call to save the card data
      advanceBy(1100)
      await advanceTimersAndPromises()
      expect(writeLongUint8ArrayMock).toHaveBeenCalledTimes(2)
    }

    // Vote for yesno contest
    else if (title === measure102Contest.title) {
      fireEvent.click(getByText('Yes'))
    }

    // Vote for MsEitherNeither contest
    else if (title === measure420Contest.title) {
      fireEvent.click(getByText(measure420Contest.neitherOption.label))
      fireEvent.click(getByText(measure420Contest.firstOption.label))
    }

    fireEvent.click(getByText('Next'))
  }

  // Review Screen
  await advanceTimersAndPromises()
  getByText('Review Votes')
  expect(
    within(getByTestId('election-info')).queryByText(
      `Election ID: ${expectedElectionHash}`
    )
  ).toBeNull()
  getByText(presidentContest.candidates[0].name)
  getByText(`Yes on ${measure102Contest.shortTitle}`)

  // Change "County Commissioners" Contest
  fireEvent.click(
    getByTextWithMarkup(
      `${countyCommissionersContest.section}${countyCommissionersContest.title}`
    )
  )
  await advanceTimersAndPromises()
  getByText(/Vote for 4/i)

  // Select first candidate
  fireEvent.click(getByText(countyCommissionersContest.candidates[0].name))
  fireEvent.click(getByText(countyCommissionersContest.candidates[1].name))

  // Back to Review screen
  fireEvent.click(getByText('Review'))
  await advanceTimersAndPromises()
  getByText('Review Your Votes')
  getByText(countyCommissionersContest.candidates[0].name)
  getByText(countyCommissionersContest.candidates[1].name)
  getByText('You may still vote for 2 more candidates.')

  // Print Screen
  fireEvent.click(getByTextWithMarkup('I’m Ready to Print My Ballot'))
  getByText('Printing Official Ballot')

  // Trigger seal image loaded
  fireEvent.load(getByTestId('printed-ballot-seal-image'))

  // Mark card used and then read card again
  await advanceTimersAndPromises()

  // Font Size is still custom user setting
  expect(window.document.documentElement.style.fontSize).toBe('36px')

  // Expire timeout for display of "Printing Ballot" screen
  await advanceTimersAndPromises(GLOBALS.BALLOT_PRINTING_TIMEOUT_SECONDS)

  // Reset Ballot is called with instructions type "card"
  // Show Verify and Cast Instructions
  getByText('You’re Almost Done')
  getByText('3. Return the card to a poll worker.')

  // Check that ballots printed count is correct
  expect(printer.print).toHaveBeenCalledTimes(2)

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert voter card to load ballot.')

  // Font size has been reset to default on Insert Card screen
  expect(window.document.documentElement.style.fontSize).toBe('28px')

  // Insert Voter card which has just printed, it should say "used card"
  card.insertCard(getUsedVoterCard())
  await advanceTimersAndPromises()
  getByText('Used Card')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert voter card to load ballot.')

  // ---------------

  // Close Polls with Poll Worker Card
  card.insertCard(pollWorkerCard)
  await advanceTimersAndPromises()
  fireEvent.click(getByText('Close Polls for Center Springfield'))
  getByText('Close Polls and print Polls Closed report?')
  fireEvent.click(within(getByTestId('modal')).getByText('Yes'))
  await advanceTimersAndPromises()
  getByText('Printing Polls Closed report for Center Springfield')
  await advanceTimersAndPromises(REPORT_PRINTING_TIMEOUT_SECONDS)
  getByText('Open Polls for Center Springfield')
  expect(printer.print).toHaveBeenCalledTimes(3)

  // Save tally to card to accumulate results with other machines
  fireEvent.click(getByText('Save to Card'))
  expect(writeLongUint8ArrayMock).toHaveBeenCalledTimes(4)
  await advanceTimersAndPromises()
  expect(queryByText('Save to Card')).toBeNull()

  fireEvent.click(getByText('Print Combined Report for 1 Machine'))
  fireEvent.click(getByText('Print Report'))
  expect(printer.print).toHaveBeenCalledTimes(4)
  await advanceTimersAndPromises()
  await advanceTimersAndPromises(REPORT_PRINTING_TIMEOUT_SECONDS)

  expect(writeLongUint8ArrayMock).toHaveBeenCalledTimes(5)
  getByText('Save to Card')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  getByText('Insert Poll Worker card to open.')

  // ---------------

  // Unconfigure with Admin Card
  card.insertCard(adminCard, electionDefinition.electionData)
  await advanceTimersAndPromises()
  getByText('Election definition is loaded.')
  fireEvent.click(getByText('Remove'))
  await advanceTimersAndPromises()

  // Default Unconfigured
  getByText('Device Not Configured')
})
