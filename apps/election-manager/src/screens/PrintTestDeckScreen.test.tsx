import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react'
import { fakeKiosk } from '@votingworks/test-utils'
import { Route } from 'react-router-dom'

import PrintTestDeckScreen from './PrintTestDeckScreen'
import renderInAppContext from '../../test/renderInAppContext'

jest.mock('../components/HandMarkedPaperBallot')

beforeAll(() => {
  window.kiosk = fakeKiosk()
})

afterAll(() => {
  delete window.kiosk
})

test('Printing the full test deck sorts precincts', async () => {
  jest.useFakeTimers()
  const mockKiosk = window.kiosk! as jest.Mocked<KioskBrowser.Kiosk>
  mockKiosk.getPrinterInfo.mockResolvedValue([
    {
      description: 'VxPrinter',
      isDefault: true,
      name: 'VxPrinter',
      status: 0,
      connected: true,
    },
  ])

  const { getByText, getByLabelText } = renderInAppContext(
    <Route path="/tally/print-test-deck/:precinctId">
      <PrintTestDeckScreen />
    </Route>,
    {
      route: '/tally/print-test-deck/all',
    }
  )

  fireEvent.click(getByText('Print Test Deck'))

  // Check that the printing modals appear in alphabetical order
  await waitFor(() => getByLabelText('Printing Test Deck, (1 of 13),: ,Bywy.'))
  jest.advanceTimersByTime(15000)
  await waitFor(() =>
    getByLabelText('Printing Test Deck, (2 of 13),: ,Chester.')
  )
  jest.advanceTimersByTime(15000)
  await waitFor(() =>
    getByLabelText('Printing Test Deck, (3 of 13),: ,District 5.')
  )
  jest.advanceTimersByTime(15000)
  await waitFor(() =>
    getByLabelText('Printing Test Deck, (4 of 13),: ,East Weir.')
  )
  jest.advanceTimersByTime(15000)
  await waitFor(() =>
    getByLabelText('Printing Test Deck, (5 of 13),: ,Fentress.')
  )
  jest.advanceTimersByTime(15000)
  await waitFor(() =>
    getByLabelText('Printing Test Deck, (6 of 13),: ,French Camp.')
  )
  jest.advanceTimersByTime(15000)
  await waitFor(() =>
    getByLabelText('Printing Test Deck, (7 of 13),: ,Hebron.')
  )
  jest.advanceTimersByTime(15000)
  await waitFor(() =>
    getByLabelText('Printing Test Deck, (8 of 13),: ,Kenego.')
  )
  jest.advanceTimersByTime(15000)
  await waitFor(() =>
    getByLabelText('Printing Test Deck, (9 of 13),: ,Panhandle.')
  )
  jest.advanceTimersByTime(15000)
  await waitFor(() =>
    getByLabelText('Printing Test Deck, (10 of 13),: ,Reform.')
  )
  jest.advanceTimersByTime(15000)
  await waitFor(() =>
    getByLabelText('Printing Test Deck, (11 of 13),: ,Sherwood.')
  )
  jest.advanceTimersByTime(15000)
  await waitFor(() =>
    getByLabelText('Printing Test Deck, (12 of 13),: ,Southwest Ackerman.')
  )
  jest.advanceTimersByTime(15000)
  await waitFor(() =>
    getByLabelText('Printing Test Deck, (13 of 13),: ,West Weir.')
  )
})
