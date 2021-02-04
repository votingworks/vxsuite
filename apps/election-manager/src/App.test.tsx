import * as fs from 'fs'
import { sha256 } from 'js-sha256'
import { join } from 'path'
import React from 'react'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { parseElection } from '@votingworks/ballot-encoder'
import { MemoryStorage } from './utils/Storage'
import {
  AppStorage,
  configuredAtStorageKey,
  cvrsStorageKey,
  electionDefinitionStorageKey,
} from './AppRoot'

import CastVoteRecordFiles from './utils/CastVoteRecordFiles'

import fakeKiosk, { fakeUsbDrive } from '../test/helpers/fakeKiosk'

import App from './App'

import sleep from './utils/sleep'
import { ElectionDefinition } from './config/types'
import fakeFileWriter from '../test/helpers/fakeFileWriter'

const eitherNeitherElectionData = fs.readFileSync(
  join(
    __dirname,
    '../test/fixtures/eitherneither-election/eitherneither-election.json'
  ),
  'utf-8'
)
const eitherNeitherElectionHash = sha256(eitherNeitherElectionData)
const eitherNeitherElection = parseElection(
  JSON.parse(eitherNeitherElectionData)
)

const EITHER_NEITHER_CVR_PATH = join(
  __dirname,
  '..',
  'test',
  'fixtures',
  'eitherneither-election',
  'eitherneither-cvrs.txt'
)
const EITHER_NEITHER_CVRS = new File(
  [fs.readFileSync(EITHER_NEITHER_CVR_PATH)],
  'cvrs.txt'
)

jest.mock('./components/HandMarkedPaperBallot')

beforeEach(() => {
  // we don't care about network errors logged to the console, they're crowding things
  jest.spyOn(console, 'error').mockImplementation(() => {}) // eslint-disable-line @typescript-eslint/no-empty-function

  window.location.href = '/'
  const mockKiosk = fakeKiosk()
  window.kiosk = mockKiosk
  mockKiosk.getPrinterInfo.mockResolvedValue([
    {
      description: 'VxPrinter',
      isDefault: false,
      name: 'VxPrinter',
      status: 0,
      connected: true,
    },
  ])
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()])
})

afterEach(() => {
  delete window.kiosk
})

const createMemoryStorageWith = async ({
  electionDefinition,
}: {
  electionDefinition: ElectionDefinition
}) => {
  const storage = new MemoryStorage<AppStorage>()
  await storage.set(electionDefinitionStorageKey, electionDefinition)
  await storage.set(configuredAtStorageKey, new Date().toISOString())
  return storage
}

it('create election works', async () => {
  const { getByText, getAllByText } = render(<App />)

  await screen.findByText('Create New Election Definition')
  fireEvent.click(getByText('Create New Election Definition'))
  await screen.findByText('Ballots')

  fireEvent.click(getByText('Ballots'))
  fireEvent.click(getAllByText('View Ballot')[0])
  fireEvent.click(getByText('English/Spanish'))

  fireEvent.click(getByText('Definition'))
  fireEvent.click(getByText('JSON Editor'))

  // remove the election
  fireEvent.click(getByText('Remove'))
  fireEvent.click(getByText('Remove Election Definition'))

  await screen.findByText('Configure Election Manager')
})

it('printing ballots, print report, and test decks', async () => {
  const mockKiosk = window.kiosk! as jest.Mocked<KioskBrowser.Kiosk>
  const storage = await createMemoryStorageWith({
    electionDefinition: {
      election: eitherNeitherElection,
      electionData: eitherNeitherElectionData,
      electionHash: eitherNeitherElectionHash,
    },
  })
  jest.useFakeTimers()

  const { container, getByText, getAllByText, queryAllByText } = render(
    <App storage={storage} />
  )
  jest.advanceTimersByTime(2001) // Cause the usb drive to be detected

  await screen.findByText('0 official ballots')

  // go print some ballots
  fireEvent.click(getByText('Export Ballot Package'))
  fireEvent.click(getByText('Export'))

  jest.useRealTimers()

  // we're not mocking the filestream yet
  await screen.findByText(/Download Failed/)
  expect(mockKiosk.makeDirectory).toHaveBeenCalledTimes(1)
  expect(mockKiosk.writeFile).toHaveBeenCalledTimes(1)
  fireEvent.click(getByText('Close'))

  // Mock the file stream and export again
  mockKiosk.writeFile = jest.fn().mockResolvedValue(fakeFileWriter())
  fireEvent.click(getByText('Export Ballot Package'))
  fireEvent.click(getByText('Export'))
  await screen.findByText(/Generating Ballot/)
  expect(mockKiosk.makeDirectory).toHaveBeenCalledTimes(2)
  expect(mockKiosk.writeFile).toHaveBeenCalledTimes(1) // Since we recreated the jest function to mock the response this will be 1

  fireEvent.click(getByText('Ballots'))
  fireEvent.click(getAllByText('View Ballot')[0])
  fireEvent.click(getByText('Precinct'))
  fireEvent.click(getByText('Absentee'))
  fireEvent.click(getByText('Test'))
  fireEvent.click(getByText('Official'))
  fireEvent.click(getByText('Print 1 Official', { exact: false }))

  await waitFor(() => getByText('Printing'))
  expect(mockKiosk.print).toHaveBeenCalledTimes(1)

  // this is ugly but necessary for now to wait just a bit for the data to be stored
  await sleep(0)

  fireEvent.click(getByText('Ballots'))
  getByText('1 official ballot', { exact: false })
  fireEvent.click(getByText('Printed Ballots Report'))
  fireEvent.click(queryAllByText('Print Report')[0])

  await waitFor(() => getByText('Printing'))
  expect(mockKiosk.print).toHaveBeenCalledTimes(2)

  fireEvent.click(getByText('Tally'))
  fireEvent.click(getByText('Print Test Decks'))
  getByText('Chester')
  fireEvent.click(getByText('District 5'))

  await screen.findByText('Print Test Deck')
  fireEvent.click(getByText('Print Test Deck'))
  await screen.findByText('Printing Test Deck: District 5', {
    exact: false,
  })
  expect(container).toMatchSnapshot()

  expect(mockKiosk.print).toHaveBeenCalledTimes(3)

  fireEvent.click(getByText('Tally'))
  fireEvent.click(getByText('View Test Ballot Deck Tally'))
  fireEvent.click(getByText('All Precincts'))
  await screen.findByText('Print Results Report')
  expect(container).toMatchSnapshot()
  fireEvent.click(getByText('Print Results Report'))

  await waitFor(() => getByText('Printing'))
  expect(mockKiosk.print).toHaveBeenCalledTimes(4)
})

it('tabulating CVRs', async () => {
  const storage = await createMemoryStorageWith({
    electionDefinition: {
      election: eitherNeitherElection,
      electionData: eitherNeitherElectionData,
      electionHash: eitherNeitherElectionHash,
    },
  })

  const castVoteRecordFiles = await CastVoteRecordFiles.empty.add(
    EITHER_NEITHER_CVRS,
    eitherNeitherElection
  )

  await storage.set(cvrsStorageKey, castVoteRecordFiles.export())
  const { getByText, getAllByText, getByTestId } = render(
    <App storage={storage} />
  )

  await screen.findByText('0 official ballots')

  fireEvent.click(getByText('Tally'))

  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('100')
  )

  getByText('View Unofficial Full Election Tally Report')
  fireEvent.click(getByText('Mark Tally Results as Official…'))
  getByText('Mark Unofficial Tally Results as Official Tally Results?')
  fireEvent.click(getByText('Mark Tally Results as Official'))

  fireEvent.click(getByText('View Official Full Election Tally Report'))

  expect(
    getAllByText('Official Mock General Election Choctaw 2020 Tally Report')
      .length > 0
  ).toBe(true)
  getByText('Number of Ballots Cast: 100')
  expect(getByTestId('tally-report-contents')).toMatchSnapshot()

  fireEvent.click(getByText('Tally'))

  await waitFor(() => {
    fireEvent.click(getByText('View Official Tally Reports for All Precincts'))
  })

  getByText(
    'Official Mock General Election Choctaw 2020 Tally Reports for All Precincts'
  )
  // Test that each precinct has a tally report generated
  eitherNeitherElection.precincts.forEach((p) => {
    getByText(`Official Precinct Tally Report for: ${p.name}`)
  })
  expect(getAllByText('Mock General Election Choctaw 2020').length).toBe(
    eitherNeitherElection.precincts.length
  )

  fireEvent.click(getByText('Tally'))
  fireEvent.click(getByText('Remove CVR Files…'))
  fireEvent.click(getByText('Remove All CVR Files'))
  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('0')
  )

  // When there are no CVRs imported the full tally report is labeled as the zero report
  fireEvent.click(getByText('View Unofficial Full Election Tally Report'))
  // Verify the zero report generates properly
  getByText('Number of Ballots Cast: 0')
  expect(getByTestId('tally-report-contents')).toMatchSnapshot()
})
