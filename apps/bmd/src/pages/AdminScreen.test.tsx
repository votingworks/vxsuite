import React from 'react'
import { act, fireEvent, screen, within } from '@testing-library/react'
import MockDate from 'mockdate'

import { asElectionDefinition } from '@votingworks/fixtures'
import { fakeKiosk } from '@votingworks/test-utils'
import { render } from '../../test/testUtils'
import { election, defaultPrecinctId } from '../../test/helpers/election'

import fakePrinter from '../../test/helpers/fakePrinter'
import { advanceTimers } from '../../test/helpers/smartcards'

import AdminScreen from './AdminScreen'
import { VxPrintOnly, VxMarkOnly, PrecinctSelectionKind } from '../config/types'
import fakeMachineConfig from '../../test/helpers/fakeMachineConfig'
import {
  AriaScreenReader,
  SpeechSynthesisTextToSpeech,
} from '../utils/ScreenReader'

MockDate.set('2020-10-31T00:00:00.000Z')

jest.useFakeTimers()

beforeEach(() => {
  window.location.href = '/'
  window.kiosk = fakeKiosk()
})

afterEach(() => {
  window.kiosk = undefined
})

test('renders ClerkScreen for VxPrintOnly', async () => {
  render(
    <AdminScreen
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      ballotsPrintedCount={0}
      electionDefinition={asElectionDefinition(election)}
      fetchElection={jest.fn()}
      isLiveMode={false}
      updateAppPrecinct={jest.fn()}
      toggleLiveMode={jest.fn()}
      unconfigure={jest.fn()}
      machineConfig={fakeMachineConfig({
        appMode: VxPrintOnly,
        codeVersion: '', // Override default
      })}
      printer={fakePrinter()}
      screenReader={new AriaScreenReader(new SpeechSynthesisTextToSpeech())}
    />
  )

  // Configure with Admin Card
  advanceTimers()

  // View Test Ballot Decks
  fireEvent.click(screen.getByText('View Test Ballot Decks'))
  fireEvent.click(
    within(screen.getByTestId('precincts')).getByText('Center Springfield')
  )

  // Back All Decks
  fireEvent.click(screen.getByText('Back to Precincts List'))

  // Single Precinct
  fireEvent.click(screen.getByText('North Springfield'))
  fireEvent.click(screen.getByText('Back to Admin Dashboard'))

  // All Precincts
  fireEvent.click(screen.getByText('View Test Ballot Decks'))
  fireEvent.click(screen.getByText('All Precincts'))
  fireEvent.click(screen.getByText('Back to Admin Dashboard'))
})

test('renders date and time settings modal', async () => {
  render(
    <AdminScreen
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      ballotsPrintedCount={0}
      electionDefinition={asElectionDefinition(election)}
      fetchElection={jest.fn()}
      isLiveMode={false}
      updateAppPrecinct={jest.fn()}
      toggleLiveMode={jest.fn()}
      unconfigure={jest.fn()}
      machineConfig={fakeMachineConfig({
        appMode: VxMarkOnly,
        codeVersion: 'test',
      })}
      printer={fakePrinter()}
      screenReader={new AriaScreenReader(new SpeechSynthesisTextToSpeech())}
    />
  )

  // Configure with Admin Card
  advanceTimers()

  const startDate = 'Sat, Oct 31, 2020, 12:00 AM UTC'
  screen.getByText(startDate)

  // Open Modal and change date
  fireEvent.click(screen.getByText('Update Date and Time'))

  within(screen.getByTestId('modal')).getByText('Sat, Oct 31, 2020, 12:00 AM')

  const selectYear = screen.getByTestId('selectYear')
  const optionYear = (within(selectYear).getByText('2025') as HTMLOptionElement)
    .value
  fireEvent.change(selectYear, { target: { value: optionYear } })

  const selectMonth = screen.getByTestId('selectMonth')
  const optionMonth = (within(selectMonth).getByText(
    'Feb'
  ) as HTMLOptionElement).value
  fireEvent.change(selectMonth, { target: { value: optionMonth } })

  // Expect day to change because Feb doesn't have 31 days.
  within(screen.getByTestId('modal')).getByText('Fri, Feb 28, 2025, 12:00 AM')

  const selectDay = screen.getByTestId('selectDay')
  const optionDay = (within(selectDay).getByText('3') as HTMLOptionElement)
    .value
  fireEvent.change(selectDay, { target: { value: optionDay } })

  const selectHour = screen.getByTestId('selectHour')
  const optionHour = (within(selectHour).getByText('11') as HTMLOptionElement)
    .value
  fireEvent.change(selectHour, { target: { value: optionHour } })

  const selectMinute = screen.getByTestId('selectMinute')
  const optionMinute = (within(selectMinute).getByText(
    '21'
  ) as HTMLOptionElement).value
  fireEvent.change(selectMinute, { target: { value: optionMinute } })

  const selectMeridian = screen.getByTestId('selectMeridian')
  const optionMeridian = (within(selectMeridian).getByText(
    'PM'
  ) as HTMLOptionElement).value
  fireEvent.change(selectMeridian, { target: { value: optionMeridian } })

  // Expect day, hour, minute, and meridian to update
  within(screen.getByTestId('modal')).getByText('Mon, Feb 3, 2025, 11:21 PM')

  const selectTimezone = screen.getByTestId(
    'selectTimezone'
  ) as HTMLSelectElement
  const optionTimezone = within(selectTimezone).getByText(
    'Central Standard Time (Chicago)'
  ) as HTMLOptionElement
  expect(optionTimezone.selected).toBeFalsy()
  fireEvent.change(selectTimezone, { target: { value: optionTimezone.value } })

  expect(selectTimezone.value).toBe('America/Chicago')
  expect(
    (within(selectTimezone).getByText(
      'Central Standard Time (Chicago)'
    ) as HTMLOptionElement).selected
  ).toBeTruthy()

  screen.getByText('Mon, Feb 3, 2025, 11:21 PM')

  // Cancel date change
  fireEvent.click(within(screen.getByTestId('modal')).getByText('Cancel'))
  screen.getByText(startDate)
  expect(window.kiosk?.setClock).not.toHaveBeenCalled()

  // Open Modal and change date again
  fireEvent.click(screen.getByText('Update Date and Time'))

  const selectDay2 = screen.getByTestId('selectDay')
  const optionDay2 = (within(selectDay2).getByText('21') as HTMLOptionElement)
    .value
  fireEvent.change(selectDay2, { target: { value: optionDay2 } })

  // Choose PM, then change hours
  const selectMeridian2 = screen.getByTestId('selectMeridian')
  const optionMeridian2 = (within(selectMeridian2).getByText(
    'PM'
  ) as HTMLOptionElement).value
  fireEvent.change(selectMeridian2, { target: { value: optionMeridian2 } })

  const selectHour2 = screen.getByTestId('selectHour')
  const optionHour2 = (within(selectHour2).getByText('11') as HTMLOptionElement)
    .value
  fireEvent.change(selectHour2, { target: { value: optionHour2 } })

  // Expect time to be in PM
  screen.getByText('Wed, Oct 21, 2020, 11:00 PM')

  // Choose AM, then change hours
  const selectMeridian3 = screen.getByTestId('selectMeridian')
  const optionMeridian3 = (within(selectMeridian3).getByText(
    'AM'
  ) as HTMLOptionElement).value
  fireEvent.change(selectMeridian3, { target: { value: optionMeridian3 } })

  // Expect time to be in AM
  screen.getByText('Wed, Oct 21, 2020, 11:00 AM')

  const selectTimezone2 = screen.getByTestId(
    'selectTimezone'
  ) as HTMLSelectElement
  const optionTimezone2 = within(selectTimezone2).getByText(
    'Pacific Daylight Time (Los Angeles)'
  ) as HTMLOptionElement
  expect(optionTimezone2.selected).toBeFalsy()
  fireEvent.change(selectTimezone2, {
    target: { value: optionTimezone2.value },
  })

  screen.getByText('Wed, Oct 21, 2020, 11:00 AM')

  // Save Date and Timezone
  await act(async () => {
    fireEvent.click(within(screen.getByTestId('modal')).getByText('Save'))
  })
  expect(window.kiosk?.setClock).toHaveBeenCalled()

  // Date is reset to system time after save to kiosk-browser
  screen.getByText(startDate)
})

test('select All Precincts', async () => {
  const updateAppPrecinct = jest.fn()
  render(
    <AdminScreen
      ballotsPrintedCount={0}
      electionDefinition={asElectionDefinition(election)}
      fetchElection={jest.fn()}
      isLiveMode
      updateAppPrecinct={updateAppPrecinct}
      toggleLiveMode={jest.fn()}
      unconfigure={jest.fn()}
      machineConfig={fakeMachineConfig()}
      printer={fakePrinter()}
      screenReader={new AriaScreenReader(new SpeechSynthesisTextToSpeech())}
    />
  )

  const precinctSelect = screen.getByLabelText('Precinct')
  const allPrecinctsOption = within(precinctSelect).getByText(
    'All Precincts'
  ) as HTMLOptionElement
  fireEvent.change(precinctSelect, {
    target: { value: allPrecinctsOption.value },
  })
  expect(updateAppPrecinct).toHaveBeenCalledWith({
    kind: PrecinctSelectionKind.AllPrecincts,
  })
})

test('blur precinct selector without a selection', async () => {
  const updateAppPrecinct = jest.fn()
  render(
    <AdminScreen
      ballotsPrintedCount={0}
      electionDefinition={asElectionDefinition(election)}
      fetchElection={jest.fn()}
      isLiveMode
      updateAppPrecinct={updateAppPrecinct}
      toggleLiveMode={jest.fn()}
      unconfigure={jest.fn()}
      machineConfig={fakeMachineConfig()}
      printer={fakePrinter()}
      screenReader={new AriaScreenReader(new SpeechSynthesisTextToSpeech())}
    />
  )

  const precinctSelect = screen.getByLabelText('Precinct')
  fireEvent.blur(precinctSelect)
  expect(updateAppPrecinct).not.toHaveBeenCalled()
})

test('render All Precincts', async () => {
  const updateAppPrecinct = jest.fn()
  render(
    <AdminScreen
      appPrecinct={{ kind: PrecinctSelectionKind.AllPrecincts }}
      ballotsPrintedCount={0}
      electionDefinition={asElectionDefinition(election)}
      fetchElection={jest.fn()}
      isLiveMode
      updateAppPrecinct={updateAppPrecinct}
      toggleLiveMode={jest.fn()}
      unconfigure={jest.fn()}
      machineConfig={fakeMachineConfig()}
      printer={fakePrinter()}
      screenReader={new AriaScreenReader(new SpeechSynthesisTextToSpeech())}
    />
  )

  const precinctSelect = screen.getByLabelText('Precinct') as HTMLSelectElement
  expect(precinctSelect.selectedOptions[0].textContent).toEqual('All Precincts')
})
