import {
  // electionSample,
  parseElection,
} from '@votingworks/types'
// TODO: Tally: Use electionSample from @votingworks/fixtures once published.

import React from 'react'
import { fireEvent, waitFor, act } from '@testing-library/react'
import { asElectionDefinition } from '@votingworks/fixtures'
import electionSample from '../data/electionSample.json'
import { mockOf, render } from '../../test/testUtils'
import { randomBase64 } from '../utils/random'
import TestBallotDeckScreen from './TestBallotDeckScreen'

import fakeKiosk, { fakePrinterInfo } from '../../test/helpers/fakeKiosk'

// mock the random value so the snapshots match
jest.mock('../utils/random')
const randomBase64Mock = mockOf(randomBase64)
randomBase64Mock.mockReturnValue('CHhgYxfN5GeqnK8KaVOt1w')

it('renders test decks appropriately', async () => {
  const { getAllByText, getByText, queryAllByText } = render(
    <TestBallotDeckScreen
      appName="VxPrint"
      appPrecinctId="23"
      electionDefinition={asElectionDefinition(parseElection(electionSample))}
      hideTestDeck={jest.fn()}
      isLiveMode={false}
    />
  )

  fireEvent.click(getByText('All Precincts'))

  expect(getAllByText('Unofficial TEST Ballot')).toHaveLength(63)
  expect(getAllByText('For either', { exact: false })).toHaveLength(31)
  expect(getAllByText('FOR Measure 420A', { exact: false })).toHaveLength(31)
  expect(getAllByText('County Commissioners')).toHaveLength(52)

  const printSpy = jest.spyOn(window, 'print').mockReturnValue()

  fireEvent.click(getByText('Print 63 ballots'))

  expect(window.print).toHaveBeenCalled()

  printSpy.mockRestore()

  window.kiosk = fakeKiosk()
  window.kiosk.getPrinterInfo = jest
    .fn()
    .mockResolvedValue([fakePrinterInfo({ connected: true })])

  jest.useFakeTimers()
  fireEvent.click(getByText('Print 63 ballots'))

  await waitFor(() => {
    expect(window.kiosk!.print).toHaveBeenCalledWith()
  })

  getByText('Printing Ballots…')
  act(() => {
    jest.advanceTimersByTime(66000)
  })
  expect(queryAllByText('Printing Ballots…').length).toBe(0)
  jest.useRealTimers()
})

it('shows printer not connected when appropriate', async () => {
  const { getByText } = render(
    <TestBallotDeckScreen
      appName="VxPrint"
      appPrecinctId="23"
      electionDefinition={asElectionDefinition(parseElection(electionSample))}
      hideTestDeck={jest.fn()}
      isLiveMode={false}
    />
  )

  window.kiosk = fakeKiosk()

  fireEvent.click(getByText('All Precincts'))

  fireEvent.click(getByText('Print 63 ballots'))

  expect(window.kiosk!.getPrinterInfo).toHaveBeenCalled()

  await waitFor(() => {
    getByText('The printer is not connected.')
  })

  fireEvent.click(getByText('OK'))
})
