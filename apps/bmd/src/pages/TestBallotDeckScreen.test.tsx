import { join } from 'path'
import React from 'react'
import { fireEvent, waitFor, act } from '@testing-library/react'
import { loadElectionDefinition } from '@votingworks/fixtures'
import { fakeKiosk, fakePrinterInfo } from '@votingworks/test-utils'
import { mockOf, render } from '../../test/testUtils'
import { randomBase64 } from '../utils/random'
import TestBallotDeckScreen from './TestBallotDeckScreen'
import fakeMachineConfig from '../../test/helpers/fakeMachineConfig'
import { VxPrintOnly } from '../config/types'
import { electionDefinition } from '../../test/helpers/election'

const electionSampleDefinition = loadElectionDefinition(
  join(__dirname, '../data/electionSample.json')
)

// mock the random value so the snapshots match
jest.mock('../utils/random')
const randomBase64Mock = mockOf(randomBase64)
randomBase64Mock.mockReturnValue('CHhgYxfN5GeqnK8KaVOt1w')

it('renders test decks appropriately', async () => {
  const { getAllByText, getByText, queryAllByText } = render(
    <TestBallotDeckScreen
      appPrecinctId="23"
      electionDefinition={electionSampleDefinition}
      hideTestDeck={jest.fn()}
      machineConfig={fakeMachineConfig({
        appMode: VxPrintOnly,
      })}
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

  const kiosk = fakeKiosk()
  window.kiosk = kiosk
  kiosk.getPrinterInfo = jest
    .fn()
    .mockResolvedValue([fakePrinterInfo({ connected: true })])

  jest.useFakeTimers()
  fireEvent.click(getByText('Print 63 ballots'))

  await waitFor(() => {
    expect(kiosk.print).toHaveBeenCalledWith({ sides: 'one-sided' })
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
      appPrecinctId="23"
      electionDefinition={electionDefinition}
      machineConfig={fakeMachineConfig({
        appMode: VxPrintOnly,
      })}
      hideTestDeck={jest.fn()}
      isLiveMode={false}
    />
  )

  const kiosk = fakeKiosk()
  window.kiosk = kiosk

  fireEvent.click(getByText('All Precincts'))

  fireEvent.click(getByText('Print 63 ballots'))

  expect(kiosk.getPrinterInfo).toHaveBeenCalled()

  await waitFor(() => {
    getByText('The printer is not connected.')
  })

  fireEvent.click(getByText('OK'))
})
