import React from 'react'

import {
  fireEvent,
  render,
  screen,
  waitFor,
  getByTestId as domGetByTestId,
  getByText as domGetByText,
  getAllByRole as domGetAllByRole,
} from '@testing-library/react'
import { electionWithMsEitherNeitherWithDataFiles } from '@votingworks/fixtures'

import { MemoryStorage } from './utils/Storage'
import {
  AppStorage,
  configuredAtStorageKey,
  cvrsStorageKey,
  electionDefinitionStorageKey,
  externalVoteRecordsFileStorageKey,
} from './AppRoot'

import CastVoteRecordFiles from './utils/CastVoteRecordFiles'

import fakeKiosk, { fakeUsbDrive } from '../test/helpers/fakeKiosk'

import App from './App'

import sleep from './utils/sleep'
import { ElectionDefinition } from './config/types'
import fakeFileWriter from '../test/helpers/fakeFileWriter'
import { convertFileToStorageString } from './utils/file'
import { eitherNeitherElectionDefinition } from '../test/renderInAppContext'
import hasTextAcrossElements from '../test/util/hasTextAcrossElements'

const EITHER_NEITHER_CVR_DATA = electionWithMsEitherNeitherWithDataFiles.cvrData
const EITHER_NEITHER_CVR_FILE = new File([EITHER_NEITHER_CVR_DATA], 'cvrs.txt')

const EITHER_NEITHER_SEMS_DATA =
  electionWithMsEitherNeitherWithDataFiles.semsData

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
    electionDefinition: eitherNeitherElectionDefinition,
  })
  jest.useFakeTimers()

  const {
    container,
    getByText,
    getAllByText,
    queryAllByText,
    getAllByTestId,
  } = render(<App storage={storage} />)
  jest.advanceTimersByTime(2001) // Cause the usb drive to be detected

  await screen.findByText('0 official ballots')

  getByText('Mock General Election Choctaw 2020')
  getByText(
    hasTextAcrossElements(
      `Election Hash: ${eitherNeitherElectionDefinition.electionHash.slice(
        0,
        10
      )}`
    )
  )

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
  fireEvent.click(getByText('Cancel'))
  fireEvent.click(getByText('Print 1 Official', { exact: false }))
  fireEvent.click(getByText('Yes, Print'))
  await waitFor(() => getByText('Printing'))
  expect(mockKiosk.print).toHaveBeenCalledTimes(1)
  fireEvent.click(getByText('Print 1 Official', { exact: false }))
  fireEvent.click(getByText('Yes, Print'))
  await waitFor(() => getByText('Printing'))
  expect(mockKiosk.print).toHaveBeenCalledTimes(2)
  fireEvent.click(getByText('Precinct'))
  fireEvent.click(getByText('Print 1 Official', { exact: false }))
  fireEvent.click(getByText('Yes, Print'))
  await waitFor(() => getByText('Printing'))
  expect(mockKiosk.print).toHaveBeenCalledTimes(3)

  // this is ugly but necessary for now to wait just a bit for the data to be stored
  await sleep(0)

  fireEvent.click(getByText('Ballots'))
  getByText('3 official ballots', { exact: false })
  fireEvent.click(getByText('Printed Ballots Report'))
  expect(getAllByText(/2 absentee ballots/).length).toBe(2)
  expect(getAllByText(/1 precinct ballot/).length).toBe(2)
  const tableRow = getAllByTestId('row-6538-4')[0] // Row in the printed ballot report for the Bywy ballots printed earlier
  expect(
    domGetAllByRole(tableRow, 'cell', { hidden: true })!.map(
      (column) => column.textContent
    )
  ).toStrictEqual(['Bywy', '4', '2', '1', '3'])
  fireEvent.click(queryAllByText('Print Report')[0])

  await waitFor(() => getByText('Printing'))
  expect(mockKiosk.print).toHaveBeenCalledTimes(4)

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

  expect(mockKiosk.print).toHaveBeenCalledTimes(5)

  fireEvent.click(getByText('Tally'))
  fireEvent.click(getByText('View Test Ballot Deck Tally'))
  fireEvent.click(getByText('All Precincts'))
  await screen.findByText('Print Results Report')
  expect(container).toMatchSnapshot()
  fireEvent.click(getByText('Print Results Report'))

  await waitFor(() => getByText('Printing'))
  expect(mockKiosk.print).toHaveBeenCalledTimes(6)
})

it('tabulating CVRs', async () => {
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
  })

  const castVoteRecordFiles = await CastVoteRecordFiles.empty.add(
    EITHER_NEITHER_CVR_FILE,
    eitherNeitherElectionDefinition.election
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
  expect(getAllByText('Total Number of Ballots Cast: 100').length).toBe(2)
  expect(getByTestId('tally-report-contents')).toMatchSnapshot()

  fireEvent.click(getByText('Tally'))

  await waitFor(() => {
    fireEvent.click(getByText('View Official Tally Reports for All Precincts'))
  })

  getByText(
    'Official Mock General Election Choctaw 2020 Tally Reports for All Precincts'
  )
  // Test that each precinct has a tally report generated
  eitherNeitherElectionDefinition.election.precincts.forEach((p) => {
    getByText(`Official Precinct Tally Report for: ${p.name}`)
  })
  // The election title is written one extra time in the footer of the page.
  expect(getAllByText('Mock General Election Choctaw 2020').length).toBe(
    eitherNeitherElectionDefinition.election.precincts.length + 1
  )

  fireEvent.click(getByText('Tally'))
  fireEvent.click(getByText('Clear All Results…'))
  fireEvent.click(getByText('Remove All Files'))
  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('0')
  )

  // When there are no CVRs imported the full tally report is labeled as the zero report
  fireEvent.click(getByText('View Unofficial Full Election Tally Report'))
  // Verify the zero report generates properly
  expect(getAllByText('Total Number of Ballots Cast: 0').length).toBe(2)
  expect(getByTestId('tally-report-contents')).toMatchSnapshot()
})

it('tabulating CVRs with SEMS file', async () => {
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
  })

  const castVoteRecordFiles = await CastVoteRecordFiles.empty.add(
    EITHER_NEITHER_CVR_FILE,
    eitherNeitherElectionDefinition.election
  )
  await storage.set(cvrsStorageKey, castVoteRecordFiles.export())

  const semsFileStorageString = await convertFileToStorageString(
    new File([EITHER_NEITHER_SEMS_DATA], 'sems-results.csv')
  )
  await storage.set(externalVoteRecordsFileStorageKey, semsFileStorageString)

  const {
    getByText,
    getByTestId,
    getAllByTestId,
    queryAllByTestId,
    getAllByText,
  } = render(<App storage={storage} />)

  await screen.findByText('0 official ballots')

  fireEvent.click(getByText('Tally'))

  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('200')
  )
  expect(getAllByText('External Results File (sems-results.csv)').length).toBe(
    3
  )

  fireEvent.click(getByText('View Unofficial Full Election Tally Report'))
  const ballotsByDataSource = getAllByTestId('data-source-table')
  expect(ballotsByDataSource.length).toBe(2) // There are two identical copies of this table one on the page, and one in the tally report
  const vxRow = domGetByTestId(ballotsByDataSource[0], 'internaldata')
  domGetByText(vxRow, 'VotingWorks Data')
  domGetByText(vxRow, '100')

  const semsRow = domGetByTestId(ballotsByDataSource[0], 'externalvoterecords')
  domGetByText(semsRow, 'External Results File')
  domGetByText(semsRow, '100')

  const totalsRow = domGetByTestId(ballotsByDataSource[0], 'total')
  domGetByText(totalsRow, 'Total')
  domGetByText(totalsRow, '200')

  const ballotsByVotingMethod = getAllByTestId('voting-method-table')
  expect(ballotsByVotingMethod.length).toBe(2) // There are two identical copies of this table one on the page, and one in the tally report
  const absenteeRow = domGetByTestId(ballotsByVotingMethod[0], 'absentee')
  domGetByText(absenteeRow, 'Absentee')
  domGetByText(absenteeRow, '50')

  const precinctRow = domGetByTestId(ballotsByVotingMethod[0], 'standard')
  domGetByText(precinctRow, 'Precinct')
  domGetByText(precinctRow, '50')

  const semsRow2 = domGetByTestId(ballotsByDataSource[0], 'externalvoterecords')
  domGetByText(semsRow2, 'External Results File')
  domGetByText(semsRow2, '100')

  const totalsRow2 = domGetByTestId(ballotsByDataSource[0], 'total')
  domGetByText(totalsRow2, 'Total')
  domGetByText(totalsRow2, '200')

  expect(getByTestId('tally-report-contents')).toMatchSnapshot()
  fireEvent.click(getByText('Back to Tally Index'))

  // Test removing the SEMS file
  fireEvent.click(getByText('Remove External Results File…'))
  fireEvent.click(getByText('Remove External Files'))

  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('100')
  )

  fireEvent.click(getByText('View Unofficial Full Election Tally Report'))
  const ballotsByDataSource2 = queryAllByTestId('ballots-by-data-source')
  expect(ballotsByDataSource2.length).toBe(0)
  expect(getAllByText('Total Number of Ballots Cast: 100').length).toBe(2)
})

it('changing election resets sems and cvr files', async () => {
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
  })

  const castVoteRecordFiles = await CastVoteRecordFiles.empty.add(
    EITHER_NEITHER_CVR_FILE,
    eitherNeitherElectionDefinition.election
  )
  await storage.set(cvrsStorageKey, castVoteRecordFiles.export())

  const semsFileStorageString = await convertFileToStorageString(
    new File([EITHER_NEITHER_SEMS_DATA], 'sems-results.csv')
  )
  await storage.set(externalVoteRecordsFileStorageKey, semsFileStorageString)

  const { getByText, getByTestId } = render(<App storage={storage} />)

  await screen.findByText('0 official ballots')

  fireEvent.click(getByText('Tally'))

  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('200')
  )

  fireEvent.click(getByText('Definition'))
  fireEvent.click(getByText('JSON Editor'))
  fireEvent.click(getByText('Remove'))
  fireEvent.click(getByText('Remove Election Definition'))
  await waitFor(() => {
    fireEvent.click(getByText('Create New Election Definition'))
  })
  fireEvent.click(getByText('Tally'))

  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('0')
  )
  getByText('No CVR files loaded.')
})

it('clearing all files after marking as official clears SEMS and CVR file', async () => {
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
  })

  const castVoteRecordFiles = await CastVoteRecordFiles.empty.add(
    EITHER_NEITHER_CVR_FILE,
    eitherNeitherElectionDefinition.election
  )
  await storage.set(cvrsStorageKey, castVoteRecordFiles.export())

  const semsFileStorageString = await convertFileToStorageString(
    new File([EITHER_NEITHER_SEMS_DATA], 'sems-results.csv')
  )
  await storage.set(externalVoteRecordsFileStorageKey, semsFileStorageString)

  const { getByText, getByTestId } = render(<App storage={storage} />)

  await screen.findByText('0 official ballots')

  fireEvent.click(getByText('Tally'))

  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('200')
  )

  fireEvent.click(getByText('Tally'))
  fireEvent.click(getByText('Mark Tally Results as Official…'))
  fireEvent.click(getByText('Mark Tally Results as Official'))

  getByText('View Official Full Election Tally Report')
  expect(getByText('Import CVR Files').closest('button')).toBeDisabled()
  expect(getByTestId('import-sems-button')).toBeDisabled()

  fireEvent.click(getByText('Clear All Results…'))
  getByText(
    'Do you want to remove the 1 uploaded CVR file and the external results file sems-results.csv?'
  )
  fireEvent.click(getByText('Remove All Files'))

  expect(getByText('Remove CVR Files…').closest('button')).toBeDisabled()
  expect(
    getByText('Remove External Results File…').closest('button')
  ).toBeDisabled()

  expect(getByText('Import CVR Files').closest('button')).toBeEnabled()
  expect(getByTestId('import-sems-button')).toBeEnabled()

  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('0')
  )
  getByText('No CVR files loaded.')
})
