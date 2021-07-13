import React from 'react'
import MockDate from 'mockdate'

import {
  fireEvent,
  render,
  screen,
  waitFor,
  getByTestId as domGetByTestId,
  getByText as domGetByText,
  getAllByRole as domGetAllByRole,
} from '@testing-library/react'
import fetchMock from 'fetch-mock'
import { electionWithMsEitherNeitherWithDataFiles } from '@votingworks/fixtures'
import { sleep, MemoryStorage } from '@votingworks/utils'
import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils'
import { ElectionDefinition } from '@votingworks/types'

import {
  configuredAtStorageKey,
  cvrsStorageKey,
  electionDefinitionStorageKey,
  externalVoteTalliesFileStorageKey,
} from './AppRoot'

import CastVoteRecordFiles from './utils/CastVoteRecordFiles'

import App from './App'

import fakeFileWriter from '../test/helpers/fakeFileWriter'
import fakePrinter from '../test/helpers/fakePrinter'
import { eitherNeitherElectionDefinition } from '../test/renderInAppContext'
import hasTextAcrossElements from '../test/util/hasTextAcrossElements'
import { ExternalTallySourceType, VotingMethod } from './config/types'
import { convertSEMSFileToExternalTally } from './utils/semsTallies'
import {
  convertExternalTalliesToStorageString,
  convertTalliesByPrecinctToFullExternalTally,
} from './utils/externalTallies'

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
  MockDate.set(new Date('2020-11-03T22:22:00'))
  fetchMock.reset()
  fetchMock.get('/convert/election/files', {
    inputFiles: [{ name: 'name' }, { name: 'name' }],
    outputFiles: [{ name: 'name' }],
  })
  fetchMock.get('/convert/tallies/files', {
    inputFiles: [{ name: 'name' }, { name: 'name' }],
    outputFiles: [{ name: 'name' }],
  })
})

afterEach(() => {
  delete window.kiosk
  MockDate.reset()
  jest.useRealTimers()
})

const createMemoryStorageWith = async ({
  electionDefinition,
}: {
  electionDefinition: ElectionDefinition
}) => {
  const storage = new MemoryStorage()
  await storage.set(electionDefinitionStorageKey, electionDefinition)
  await storage.set(configuredAtStorageKey, new Date().toISOString())
  return storage
}

test('create election works', async () => {
  const { getByText, getAllByText, queryAllByText, getByTestId } = render(
    <App />
  )

  await screen.findByText('Create New Election Definition')
  fireEvent.click(getByText('Create New Election Definition'))
  await screen.findByText('Ballots')

  fireEvent.click(getByText('Ballots'))
  fireEvent.click(getAllByText('View Ballot')[0])
  fireEvent.click(getByText('English/Spanish'))

  fireEvent.click(getByText('Definition'))

  // Verify editing an election is disabled
  fireEvent.click(getByText('View Definition JSON'))
  expect(queryAllByText('Save').length).toBe(0)
  expect(queryAllByText('Reset').length).toBe(0)
  expect(getByTestId('json-input').hasAttribute('disabled')).toBe(true)

  // remove the election
  fireEvent.click(getByText('Remove'))
  fireEvent.click(getByText('Remove Election Definition'))

  await screen.findByText('Configure Election Manager')
})

test('printing ballots, print report, and test decks', async () => {
  const mockKiosk = window.kiosk! as jest.Mocked<KioskBrowser.Kiosk>
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
  })
  jest.useFakeTimers()

  const printer = fakePrinter()
  const {
    container,
    getByText,
    getAllByText,
    queryAllByText,
    getAllByTestId,
  } = render(<App storage={storage} printer={printer} />)
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
  expect(printer.print).toHaveBeenCalledTimes(1)
  fireEvent.click(getByText('Print 1 Official', { exact: false }))
  fireEvent.click(getByText('Yes, Print'))
  await waitFor(() => getByText('Printing'))
  expect(printer.print).toHaveBeenCalledTimes(2)
  fireEvent.click(getByText('Precinct'))
  fireEvent.click(getByText('Print 1 Official', { exact: false }))
  fireEvent.click(getByText('Yes, Print'))
  await waitFor(() => getByText('Printing'))
  expect(printer.print).toHaveBeenCalledTimes(3)

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
  expect(printer.print).toHaveBeenCalledTimes(4)

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

  expect(printer.print).toHaveBeenCalledTimes(5)

  fireEvent.click(getByText('Tally'))
  fireEvent.click(getByText('View Test Ballot Deck Tally'))
  fireEvent.click(getByText('All Precincts'))
  await screen.findByText('Print Results Report')
  expect(container).toMatchSnapshot()
  fireEvent.click(getByText('Print Results Report'))

  await waitFor(() => getByText('Printing'))
  expect(printer.print).toHaveBeenCalledTimes(6)
})

test('tabulating CVRs', async () => {
  jest.useFakeTimers()
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
  jest.advanceTimersByTime(2001) // Cause the usb drive to be detected

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
  // TODO: Snapshots without clear definition of what they are for cause future developers to have to figure out what the test is for each time this test breaks.
  expect(getByTestId('election-full-tally-report')).toMatchSnapshot()

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

  // Save SEMS file
  fetchMock.post('/convert/tallies/submitfile', { body: { status: 'ok' } })
  fetchMock.post('/convert/tallies/process', { body: { status: 'ok' } })

  fetchMock.getOnce('/convert/tallies/output?name=name', {
    body: 'test-content',
  })

  fetchMock.post('/convert/reset', { body: { status: 'ok' } })
  fireEvent.click(getByText('Tally'))
  await waitFor(() => getByText('Save Results File'))
  fireEvent.click(getByText('Save Results File'))
  jest.advanceTimersByTime(2001)
  getByText('Save Results')
  getByText(/Save the election results as /)
  getByText(
    'votingworks-live-results_choctaw-county_mock-general-election-choctaw-2020_2020-11-03_22-22-00.csv'
  )

  fireEvent.click(getByText('Save'))
  await waitFor(() => getByText(/Saving/))
  jest.advanceTimersByTime(2001)
  await waitFor(() => getByText(/Results Saved/))
  await waitFor(() => {
    expect(window.kiosk!.writeFile).toHaveBeenCalledTimes(1)
    expect(window.kiosk!.writeFile).toHaveBeenNthCalledWith(
      1,
      'fake mount point/votingworks-live-results_choctaw-county_mock-general-election-choctaw-2020_2020-11-03_22-22-00.csv',
      'test-content'
    )
  })
  expect(fetchMock.called('/convert/tallies/files')).toBe(true)
  expect(fetchMock.called('/convert/tallies/submitfile')).toBe(true)
  expect(fetchMock.called('/convert/tallies/process')).toBe(true)
  expect(fetchMock.called('/convert/tallies/output?name=name')).toBe(true)
  expect(fetchMock.called('/convert/reset')).toBe(true)

  fireEvent.click(getByText('Close'))

  // Clear results
  fireEvent.click(getByText('Clear All Results…'))
  fireEvent.click(getByText('Remove All Data'))
  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('0')
  )

  // When there are no CVRs imported the full tally report is labeled as the zero report
  fireEvent.click(getByText('View Unofficial Full Election Tally Report'))
  // Verify the zero report generates properly
  expect(getAllByText('0').length).toBe(40)
})

test('tabulating CVRs with SEMS file', async () => {
  jest.useFakeTimers()
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
  })

  const castVoteRecordFiles = await CastVoteRecordFiles.empty.add(
    EITHER_NEITHER_CVR_FILE,
    eitherNeitherElectionDefinition.election
  )
  await storage.set(cvrsStorageKey, castVoteRecordFiles.export())

  const semsFileStorageString = convertSEMSFileToExternalTally(
    EITHER_NEITHER_SEMS_DATA,
    eitherNeitherElectionDefinition.election,
    VotingMethod.Precinct,
    'sems-results.csv',
    new Date()
  )
  await storage.set(
    externalVoteTalliesFileStorageKey,
    convertExternalTalliesToStorageString([semsFileStorageString])
  )

  const { getByText, getByTestId, getAllByTestId, getAllByText } = render(
    <App storage={storage} />
  )
  jest.advanceTimersByTime(2001)

  await screen.findByText('0 official ballots')

  fireEvent.click(getByText('Tally'))

  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('200')
  )
  expect(getAllByText('External Results (sems-results.csv)').length).toBe(2)

  fireEvent.click(getByText('View Unofficial Full Election Tally Report'))

  const ballotsByVotingMethod = getAllByTestId('voting-method-table')
  expect(ballotsByVotingMethod.length).toBe(1)
  const absenteeRow = domGetByTestId(ballotsByVotingMethod[0], 'absentee')
  domGetByText(absenteeRow, 'Absentee')
  domGetByText(absenteeRow, '50')

  const precinctRow = domGetByTestId(ballotsByVotingMethod[0], 'standard')
  domGetByText(precinctRow, 'Precinct')
  domGetByText(precinctRow, '150')

  const totalRow = domGetByTestId(ballotsByVotingMethod[0], 'total')
  domGetByText(totalRow, 'Total Ballots Cast')
  domGetByText(totalRow, '200')
  // TODO: Snapshots without clear definition of what they are for cause future developers to have to figure out what the test is for each time this test breaks.
  expect(getByTestId('election-full-tally-report')).toMatchSnapshot()
  fireEvent.click(getByText('Back to Tally Index'))

  // Test exporting the final results
  fetchMock.post('/convert/tallies/submitfile', { body: { status: 'ok' } })
  fetchMock.post('/convert/tallies/process', { body: { status: 'ok' } })

  fetchMock.getOnce('/convert/tallies/output?name=name', {
    body: 'test-content',
  })

  fetchMock.post('/convert/reset', { body: { status: 'ok' } })
  await waitFor(() => getByText('Save Results File'))
  fireEvent.click(getByText('Save Results File'))
  jest.advanceTimersByTime(2001)
  getByText('Save Results')
  getByText(/Save the election results as /)
  getByText(
    'votingworks-live-results_choctaw-county_mock-general-election-choctaw-2020_2020-11-03_22-22-00.csv'
  )

  fireEvent.click(getByText('Save'))
  await waitFor(() => getByText(/Saving/))
  jest.advanceTimersByTime(2001)
  await waitFor(() => getByText(/Results Saved/))
  await waitFor(() => {
    expect(window.kiosk!.writeFile).toHaveBeenCalledTimes(1)
    expect(window.kiosk!.writeFile).toHaveBeenNthCalledWith(
      1,
      'fake mount point/votingworks-live-results_choctaw-county_mock-general-election-choctaw-2020_2020-11-03_22-22-00.csv',
      'test-content'
    )
  })
  expect(fetchMock.called('/convert/tallies/files')).toBe(true)
  expect(fetchMock.called('/convert/tallies/submitfile')).toBe(true)
  expect(fetchMock.called('/convert/tallies/process')).toBe(true)
  expect(fetchMock.called('/convert/tallies/output?name=name')).toBe(true)
  expect(fetchMock.called('/convert/reset')).toBe(true)

  fireEvent.click(getByText('Close'))

  // Test removing the SEMS file
  fireEvent.click(getByText('Remove External Results File…'))
  fireEvent.click(getByText('Remove External Files'))

  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('100')
  )

  fireEvent.click(getByText('View Unofficial Full Election Tally Report'))
})

test('tabulating CVRs with SEMS file and manual data', async () => {
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
  })

  const castVoteRecordFiles = await CastVoteRecordFiles.empty.add(
    EITHER_NEITHER_CVR_FILE,
    eitherNeitherElectionDefinition.election
  )
  await storage.set(cvrsStorageKey, castVoteRecordFiles.export())

  const semsFileStorageString = convertSEMSFileToExternalTally(
    EITHER_NEITHER_SEMS_DATA,
    eitherNeitherElectionDefinition.election,
    VotingMethod.Precinct,
    'sems-results.csv',
    new Date()
  )
  await storage.set(
    externalVoteTalliesFileStorageKey,
    convertExternalTalliesToStorageString([semsFileStorageString])
  )

  const {
    getByText,
    getByTestId,
    getAllByText,
    getAllByTestId,
    queryAllByText,
  } = render(<App storage={storage} />)

  await screen.findByText('0 official ballots')

  fireEvent.click(getByText('Tally'))

  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('200')
  )

  fireEvent.click(getByText('Add Manually Entered Results'))
  getByText('Manually Entered Precinct Results')
  fireEvent.click(getByText('Edit Precinct Results for District 5'))
  getByText('Save Precinct Results for District 5')
  fireEvent.change(getByTestId('775020876-undervotes'), {
    target: { value: '12' },
  })
  fireEvent.change(getByTestId('775020876-overvotes'), {
    target: { value: '8' },
  })
  fireEvent.change(getByTestId('775020876-775031988'), {
    target: { value: '32' },
  })
  fireEvent.change(getByTestId('775020876-775031987'), {
    target: { value: '28' },
  })
  fireEvent.change(getByTestId('775020876-775031989'), {
    target: { value: '10' },
  })
  fireEvent.change(getByTestId('775020876-__write-in'), {
    target: { value: '10' },
  })

  fireEvent.click(getByText('Save Precinct Results for District 5'))
  await waitFor(() => getByText('Manually Entered Precinct Results'))
  await waitFor(() => {
    expect(getByTestId('total-ballots-entered').textContent).toEqual('100')
  })
  fireEvent.click(getByText('Back to Tally'))
  await waitFor(() => {
    expect(getByTestId('total-ballot-count').textContent).toEqual('300')
  })
  expect(getAllByText('External Results (Manually Added Data)').length).toBe(2)

  const fileTable = getByTestId('loaded-file-table')
  const manualRow = domGetByText(
    fileTable,
    'External Results (Manually Added Data)'
  ).closest('tr')!
  domGetByText(manualRow, '100')
  domGetByText(manualRow, 'District 5')

  fireEvent.click(getByText('View Unofficial Full Election Tally Report'))
  const ballotsByVotingMethod = getAllByTestId('voting-method-table')
  expect(ballotsByVotingMethod.length).toBe(1)
  const absenteeRow = domGetByTestId(ballotsByVotingMethod[0], 'absentee')
  domGetByText(absenteeRow, 'Absentee')
  domGetByText(absenteeRow, '50')

  const precinctRow = domGetByTestId(ballotsByVotingMethod[0], 'standard')
  domGetByText(precinctRow, 'Precinct')
  domGetByText(precinctRow, '250')

  const totalRow = domGetByTestId(ballotsByVotingMethod[0], 'total')
  domGetByText(totalRow, 'Total Ballots Cast')
  domGetByText(totalRow, '300')

  // Now edit the manual data
  fireEvent.click(getByText('Back to Tally Index'))
  fireEvent.click(getByText('Edit Manually Entered Results'))

  // Existing data is still there
  const district5Row = getByText('District 5').closest('tr')!
  expect(domGetByTestId(district5Row, 'numBallots')!.textContent).toEqual('100')

  // Change the manual data to absentee
  fireEvent.click(getByText('Absentee Results'))

  // Change to another precinct
  fireEvent.click(getByText('Edit Absentee Results for Panhandle'))
  getByText('Save Absentee Results for Panhandle')
  fireEvent.change(getByTestId('750000017-undervotes'), {
    target: { value: '17' },
  })
  fireEvent.change(getByTestId('750000017-overvotes'), {
    target: { value: '3' },
  })
  fireEvent.change(getByTestId('750000017-yes'), {
    target: { value: '54' },
  })
  fireEvent.change(getByTestId('750000017-no'), {
    target: { value: '26' },
  })

  fireEvent.click(getByText('Save Absentee Results for Panhandle'))
  await waitFor(() => {
    expect(getByTestId('total-ballots-entered').textContent).toEqual('200')
  })
  fireEvent.click(getByText('Back to Tally'))

  await waitFor(() => {
    expect(getByTestId('total-ballot-count').textContent).toEqual('400')
  })
  expect(getAllByText('External Results (Manually Added Data)').length).toBe(2)

  const fileTable2 = getByTestId('loaded-file-table')
  const manualRow2 = domGetByText(
    fileTable2,
    'External Results (Manually Added Data)'
  ).closest('tr')!
  domGetByText(manualRow2, '200')
  domGetByText(manualRow2, 'District 5, Panhandle')

  fireEvent.click(getByText('View Unofficial Full Election Tally Report'))
  const ballotsByVotingMethod2 = getAllByTestId('voting-method-table')
  expect(ballotsByVotingMethod2.length).toBe(1)
  const absenteeRow2 = domGetByTestId(ballotsByVotingMethod2[0], 'absentee')
  domGetByText(absenteeRow2, 'Absentee')
  domGetByText(absenteeRow2, '250')

  const precinctRow2 = domGetByTestId(ballotsByVotingMethod2[0], 'standard')
  domGetByText(precinctRow2, 'Precinct')
  domGetByText(precinctRow2, '150')

  const totalRow2 = domGetByTestId(ballotsByVotingMethod2[0], 'total')
  domGetByText(totalRow2, 'Total Ballots Cast')
  domGetByText(totalRow2, '400')

  // Remove the manual data
  fireEvent.click(getByText('Back to Tally Index'))
  fireEvent.click(getByText('Remove Manual Data…'))

  getByText('Do you want to remove the manually entered data?')
  fireEvent.click(getByText('Remove Manual Data'))
  await waitFor(() => {
    expect(getByTestId('total-ballot-count').textContent).toEqual('200')
  })
  expect(queryAllByText('External Results (Manually Added Data)').length).toBe(
    0
  )
})

test('changing election resets sems, cvr, and manual data files', async () => {
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
  })

  const castVoteRecordFiles = await CastVoteRecordFiles.empty.add(
    EITHER_NEITHER_CVR_FILE,
    eitherNeitherElectionDefinition.election
  )
  await storage.set(cvrsStorageKey, castVoteRecordFiles.export())

  const semsFileTally = convertSEMSFileToExternalTally(
    EITHER_NEITHER_SEMS_DATA,
    eitherNeitherElectionDefinition.election,
    VotingMethod.Precinct,
    'sems-results.csv',
    new Date()
  )
  const manualTally = convertTalliesByPrecinctToFullExternalTally(
    { '6522': { contestTallies: {}, numberOfBallotsCounted: 100 } },
    eitherNeitherElectionDefinition.election,
    VotingMethod.Absentee,
    ExternalTallySourceType.Manual,
    'Manually Added Data',
    new Date()
  )
  await storage.set(
    externalVoteTalliesFileStorageKey,
    convertExternalTalliesToStorageString([semsFileTally, manualTally])
  )

  const { getByText, getByTestId } = render(<App storage={storage} />)

  await screen.findByText('0 official ballots')

  fireEvent.click(getByText('Tally'))

  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('300')
  )

  fireEvent.click(getByText('Definition'))
  fireEvent.click(getByText('Remove Election'))
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

test('clearing all files after marking as official clears SEMS, CVR, and manual file', async () => {
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
  })

  const castVoteRecordFiles = await CastVoteRecordFiles.empty.add(
    EITHER_NEITHER_CVR_FILE,
    eitherNeitherElectionDefinition.election
  )
  await storage.set(cvrsStorageKey, castVoteRecordFiles.export())

  const semsFileTally = convertSEMSFileToExternalTally(
    EITHER_NEITHER_SEMS_DATA,
    eitherNeitherElectionDefinition.election,
    VotingMethod.Precinct,
    'sems-results.csv',
    new Date()
  )
  const manualTally = convertTalliesByPrecinctToFullExternalTally(
    { '6522': { contestTallies: {}, numberOfBallotsCounted: 100 } },
    eitherNeitherElectionDefinition.election,
    VotingMethod.Absentee,
    ExternalTallySourceType.Manual,
    'Manually Added Data',
    new Date()
  )
  await storage.set(
    externalVoteTalliesFileStorageKey,
    convertExternalTalliesToStorageString([semsFileTally, manualTally])
  )

  const { getByText, getByTestId } = render(<App storage={storage} />)

  await screen.findByText('0 official ballots')

  fireEvent.click(getByText('Tally'))

  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('300')
  )

  fireEvent.click(getByText('Tally'))
  fireEvent.click(getByText('Mark Tally Results as Official…'))
  fireEvent.click(getByText('Mark Tally Results as Official'))

  getByText('View Official Full Election Tally Report')
  expect(getByText('Import CVR Files').closest('button')).toBeDisabled()
  expect(getByTestId('import-sems-button')).toBeDisabled()

  fireEvent.click(getByText('Clear All Results…'))
  getByText(
    'Do you want to remove the 1 uploaded CVR file, the external results file sems-results.csv, and the manually entered data?'
  )
  fireEvent.click(getByText('Remove All Data'))

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
