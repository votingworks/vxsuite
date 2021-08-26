import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { advanceBy } from 'jest-date-mock'
import {
  makeAdminCard,
  makeInvalidPollWorkerCard,
  makeVoterCard,
  makePollWorkerCard,
} from '@votingworks/test-utils'
import {
  TallySourceMachineType,
  MemoryStorage,
  MemoryCard,
  MemoryHardware,
} from '@votingworks/utils'
import * as GLOBALS from './config/globals'

import { electionSampleDefinition } from './data'

import App from './App'

import withMarkup from '../test/helpers/withMarkup'

import {
  advanceTimersAndPromises,
  makeAlternateNewVoterCard,
  makeUsedVoterCard,
} from '../test/helpers/smartcards'

import {
  presidentContest,
  countyCommissionersContest,
  measure102Contest,
  measure420Contest,
  voterContests,
} from '../test/helpers/election'
import fakePrinter from '../test/helpers/fakePrinter'
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
  const hardware = await MemoryHardware.buildStandard()
  const printer = fakePrinter()
  const storage = new MemoryStorage()
  const machineConfig = fakeMachineConfigProvider({
    appMode: VxMarkPlusVxPrint,
  })
  const expectedElectionHash = electionDefinition.electionHash.substring(0, 10)
  const writeLongUint8ArrayMock = jest.spyOn(card, 'writeLongUint8Array')
  render(
    <App
      card={card}
      hardware={hardware}
      machineConfig={machineConfig}
      printer={printer}
      storage={storage}
    />
  )
  await advanceTimersAndPromises()
  const adminCard = makeAdminCard(electionDefinition.electionHash)
  const pollWorkerCard = makePollWorkerCard(electionDefinition.electionHash)
  const invalidPollWorkerCard = makeInvalidPollWorkerCard()
  const getByTextWithMarkup = withMarkup(screen.getByText)

  card.removeCard()
  await advanceTimersAndPromises()

  // Default Unconfigured
  screen.getByText('Device Not Configured')

  // ---------------

  // Configure with Admin Card
  card.insertCard(adminCard, electionDefinition.electionData)
  await advanceTimersAndPromises()
  fireEvent.click(screen.getByText('Load Election Definition'))

  await advanceTimersAndPromises()
  screen.getByText('Election definition is loaded.')

  // Remove card and expect not configured because precinct not selected
  card.removeCard()
  await advanceTimersAndPromises()
  screen.getByText('Device Not Configured')

  // ---------------

  // Configure election with Admin Card
  card.insertCard(adminCard, electionDefinition.electionData)
  await advanceTimersAndPromises()
  screen.getByLabelText('Precinct')
  screen.queryByText(`Election ID: ${expectedElectionHash}`)
  screen.queryByText('Machine ID: 000')

  // Select precinct
  screen.getByText('State of Hamilton')
  const precinctSelect = screen.getByLabelText('Precinct')
  const precinctId = (within(precinctSelect).getByText(
    'Center Springfield'
  ) as HTMLOptionElement).value
  fireEvent.change(precinctSelect, { target: { value: precinctId } })
  within(screen.getByTestId('election-info')).getByText('Center Springfield')

  fireEvent.click(screen.getByText('Live Election Mode'))
  expect(
    (screen.getByText('Live Election Mode') as HTMLButtonElement).disabled
  ).toBeTruthy()

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  screen.getByText('Polls Closed')
  screen.getByText('Insert Poll Worker card to open.')

  // ---------------

  // Using an invalid Poll Worker Card shows an error
  card.insertCard(invalidPollWorkerCard)
  await advanceTimersAndPromises()
  screen.getByText('Invalid Card Data')
  screen.getByText('Card is not configured for this election.')
  screen.getByText('Please ask admin for assistance.')
  card.removeCard()

  // Open Polls with Poll Worker Card
  card.insertCard(pollWorkerCard)
  await advanceTimersAndPromises()
  screen.queryByText(`Election ID: ${expectedElectionHash}`)
  fireEvent.click(screen.getByText('Open Polls for Center Springfield'))
  fireEvent.click(within(screen.getByTestId('modal')).getByText('Cancel'))
  fireEvent.click(screen.getByText('Open Polls for Center Springfield'))
  screen.getByText('Open polls and print Polls Opened report?')
  fireEvent.click(within(screen.getByTestId('modal')).getByText('Yes'))
  await advanceTimersAndPromises()
  screen.getByText('Printing Polls Opened report for Center Springfield')
  await advanceTimersAndPromises(REPORT_PRINTING_TIMEOUT_SECONDS)
  screen.getByText('Close Polls for Center Springfield')
  expect(printer.print).toHaveBeenCalledTimes(1)

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  screen.getByText('Insert voter card to load ballot.')

  // ---------------

  // Voter partially votes, remove card, and is on insert card screen.
  card.insertCard(makeVoterCard(electionDefinition.election))
  await advanceTimersAndPromises()
  screen.getByText(/Center Springfield/)
  expect(screen.queryByText(expectedElectionHash)).toBeNull()
  expect(
    within(screen.getByTestId('election-info')).queryByText(
      `Election ID: ${expectedElectionHash}`
    )
  ).toBeNull()
  screen.getByText(/ballot style 12/)
  getByTextWithMarkup('Your ballot has 21 contests.')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  screen.getByText('Insert voter card to load ballot.')

  // ---------------

  // Alternate Precinct
  card.insertCard(makeAlternateNewVoterCard())
  await advanceTimersAndPromises()
  screen.getByText('Invalid Card Data')
  screen.getByText('Card is not configured for this precinct.')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  screen.getByText('Insert voter card to load ballot.')

  // ---------------

  // Complete Voter Happy Path

  // Insert Voter card
  card.insertCard(makeVoterCard(electionDefinition.election))
  await advanceTimersAndPromises()
  screen.getByText(/Center Springfield/)
  screen.getByText(/ballot style 12/)
  expect(
    within(screen.getByTestId('election-info')).queryByText(
      `Election ID: ${expectedElectionHash}`
    )
  ).toBeNull()
  getByTextWithMarkup('Your ballot has 21 contests.')

  // Adjust Text Size
  const changeTextSize = within(screen.getByTestId('change-text-size-buttons'))
  const textSizeButtons = changeTextSize.getAllByText('A')
  expect(textSizeButtons.length).toBe(3)
  fireEvent.click(textSizeButtons[0]) // html element has new font size
  expect(window.document.documentElement.style.fontSize).toBe('22px')
  fireEvent.click(textSizeButtons[1]) // html element has default font size
  expect(window.document.documentElement.style.fontSize).toBe('28px')
  fireEvent.click(textSizeButtons[2]) // html element has default font size
  expect(window.document.documentElement.style.fontSize).toBe('36px')

  // Start Voting
  fireEvent.click(screen.getByText('Start Voting'))

  // Initial empty votes written to the card after tapping "Start Voting".
  await advanceTimersAndPromises()
  expect(writeLongUint8ArrayMock).toHaveBeenCalledTimes(1)

  // Advance through every contest
  for (let i = 0; i < voterContests.length; i++) {
    const { title } = voterContests[i]

    await advanceTimersAndPromises()
    screen.getByText(title)
    expect(
      within(screen.getByTestId('election-info')).queryByText(
        `Election ID: ${expectedElectionHash}`
      )
    ).toBeNull()

    // Vote for candidate contest
    if (title === presidentContest.title) {
      fireEvent.click(screen.getByText(presidentContest.candidates[0].name))
      await advanceTimersAndPromises() // Update the vote being saved internally

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
      fireEvent.click(screen.getByText('Yes'))
    }

    // Vote for MsEitherNeither contest
    else if (title === measure420Contest.title) {
      fireEvent.click(screen.getByText(measure420Contest.neitherOption.label))
      fireEvent.click(screen.getByText(measure420Contest.firstOption.label))
    }

    fireEvent.click(screen.getByText('Next'))
  }

  // Review Screen
  await advanceTimersAndPromises()
  screen.getByText('Review Votes')
  expect(
    within(screen.getByTestId('election-info')).queryByText(
      `Election ID: ${expectedElectionHash}`
    )
  ).toBeNull()
  screen.getByText(presidentContest.candidates[0].name)
  screen.getByText(`Yes on ${measure102Contest.shortTitle}`)

  // Change "County Commissioners" Contest
  fireEvent.click(
    getByTextWithMarkup(
      `${countyCommissionersContest.section}${countyCommissionersContest.title}`
    )
  )
  await advanceTimersAndPromises()
  screen.getByText(/Vote for 4/i)

  // Select first candidate
  fireEvent.click(
    screen.getByText(countyCommissionersContest.candidates[0].name)
  )
  fireEvent.click(
    screen.getByText(countyCommissionersContest.candidates[1].name)
  )

  // Back to Review screen
  fireEvent.click(screen.getByText('Review'))
  await advanceTimersAndPromises()
  screen.getByText('Review Your Votes')
  screen.getByText(countyCommissionersContest.candidates[0].name)
  screen.getByText(countyCommissionersContest.candidates[1].name)
  screen.getByText('You may still vote for 2 more candidates.')

  // Print Screen
  fireEvent.click(getByTextWithMarkup('I’m Ready to Print My Ballot'))
  screen.getByText('Printing Official Ballot')

  // Trigger seal image loaded
  fireEvent.load(screen.getByTestId('printed-ballot-seal-image'))

  // Mark card used and then read card again
  await advanceTimersAndPromises()

  // Font Size is still custom user setting
  expect(window.document.documentElement.style.fontSize).toBe('36px')

  // Expire timeout for display of "Printing Ballot" screen
  await advanceTimersAndPromises(GLOBALS.BALLOT_PRINTING_TIMEOUT_SECONDS)

  // Reset Ballot is called with instructions type "card"
  // Show Verify and Cast Instructions
  screen.getByText('You’re Almost Done')
  screen.getByText('3. Return the card to a poll worker.')

  // Check that ballots printed count is correct
  expect(printer.print).toHaveBeenCalledTimes(2)

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  screen.getByText('Insert voter card to load ballot.')

  // Font size has been reset to default on Insert Card screen
  expect(window.document.documentElement.style.fontSize).toBe('28px')

  // Insert Voter card which has just printed, it should say "used card"
  card.insertCard(makeUsedVoterCard())
  await advanceTimersAndPromises()
  screen.getByText('Used Card')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  screen.getByText('Insert voter card to load ballot.')

  // ---------------

  // Close Polls with Poll Worker Card
  card.insertCard(pollWorkerCard)
  await advanceTimersAndPromises()
  fireEvent.click(screen.getByText('Close Polls for Center Springfield'))
  screen.getByText('Close Polls and print Polls Closed report?')
  fireEvent.click(within(screen.getByTestId('modal')).getByText('Yes'))
  await advanceTimersAndPromises()
  screen.getByText('Printing Polls Closed report for Center Springfield')
  await advanceTimersAndPromises(REPORT_PRINTING_TIMEOUT_SECONDS)
  screen.getByText('Open Polls for Center Springfield')
  expect(printer.print).toHaveBeenCalledTimes(3)

  // Save tally to card to accumulate results with other machines
  fireEvent.click(screen.getByText('Save to Card'))
  expect(writeLongUint8ArrayMock).toHaveBeenCalledTimes(4)
  await advanceTimersAndPromises()
  expect(screen.queryByText('Save to Card')).toBeNull()

  fireEvent.click(screen.getByText('Print Combined Report for 1 Machine'))
  fireEvent.click(screen.getByText('Print Report'))
  expect(printer.print).toHaveBeenCalledTimes(4)
  await advanceTimersAndPromises()
  await advanceTimersAndPromises(REPORT_PRINTING_TIMEOUT_SECONDS)

  expect(writeLongUint8ArrayMock).toHaveBeenCalledTimes(5)
  screen.getByText('Save to Card')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises()
  screen.getByText('Insert Poll Worker card to open.')

  // Insert a pollworker card with tally data on it.
  card.insertCard(
    pollWorkerCard,
    JSON.stringify({
      tallyMachineType: TallySourceMachineType.BMD,
      metadata: [
        {
          machineId: '002',
          timeSaved: new Date('2020-10-31').getTime(),
          ballotCount: 3,
        },
      ],
      totalBallotsPrinted: 10,
    })
  )
  await advanceTimersAndPromises()
  screen.getByText('Open Polls for Center Springfield')
  screen.getByText('Print Combined Report for 2 Machines')

  // ---------------

  // Unconfigure with Admin Card
  card.insertCard(adminCard, electionDefinition.electionData)
  await advanceTimersAndPromises()
  screen.getByText('Election definition is loaded.')
  fireEvent.click(screen.getByText('Remove'))
  await advanceTimersAndPromises()

  // Default Unconfigured
  screen.getByText('Device Not Configured')
})
