import React from 'react';
import MockDate from 'mockdate';

import {
  fireEvent,
  render,
  screen,
  waitFor,
  getByTestId as domGetByTestId,
  getByText as domGetByText,
  getAllByRole as domGetAllByRole,
  getAllByText as domGetAllByText,
  act,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fetchMock from 'fetch-mock';
import { electionWithMsEitherNeitherWithDataFiles } from '@votingworks/fixtures';
import {
  MemoryStorage,
  MemoryCard,
  MemoryHardware,
  typedAs,
} from '@votingworks/utils';
import {
  advanceTimersAndPromises,
  fakeKiosk,
  fakePrinterInfo,
  fakeUsbDrive,
} from '@votingworks/test-utils';
import {
  AdminCardData,
  ElectionDefinition,
  ExternalTallySourceType,
  PollworkerCardData,
  VotingMethod,
} from '@votingworks/types';

import { LogEventId } from '@votingworks/logging';
import {
  configuredAtStorageKey,
  cvrsStorageKey,
  electionDefinitionStorageKey,
  externalVoteTalliesFileStorageKey,
} from './app_root';

import { CastVoteRecordFiles } from './utils/cast_vote_record_files';

import { App } from './app';

import { fakePrinter } from '../test/helpers/fake_printer';
import { eitherNeitherElectionDefinition } from '../test/render_in_app_context';
import { hasTextAcrossElements } from '../test/util/has_text_across_elements';

import { convertSemsFileToExternalTally } from './utils/sems_tallies';
import {
  convertExternalTalliesToStorageString,
  convertTalliesByPrecinctToFullExternalTally,
} from './utils/external_tallies';
import { MachineConfig } from './config/types';
import { VxFiles } from './lib/converters';
import { areVvsg2AuthFlowsEnabled } from './config/features';

const EITHER_NEITHER_CVR_DATA =
  electionWithMsEitherNeitherWithDataFiles.cvrData;
const EITHER_NEITHER_CVR_FILE = new File([EITHER_NEITHER_CVR_DATA], 'cvrs.txt');

const EITHER_NEITHER_CVR_TEST_DATA =
  electionWithMsEitherNeitherWithDataFiles.cvrTestData;
const EITHER_NEITHER_CVR_TEST_FILE = new File(
  [EITHER_NEITHER_CVR_TEST_DATA],
  'cvrs.txt'
);

const EITHER_NEITHER_SEMS_DATA =
  electionWithMsEitherNeitherWithDataFiles.semsData;

jest.mock('./components/hand_marked_paper_ballot');
jest.mock('./utils/pdf_to_images');
jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  const original: typeof import('@votingworks/utils') =
    jest.requireActual('@votingworks/utils');
  // Mock random string generation so that snapshots match, while leaving the rest of the module
  // intact
  return {
    ...original,
    randomBallotId: () => 'Asdf1234Asdf12',
  };
});
jest.mock('./config/features', (): typeof import('./config/features') => {
  const original: typeof import('./config/features') =
    jest.requireActual('./config/features');
  return {
    ...original,
    areVvsg2AuthFlowsEnabled: jest.fn(),
  };
});

let mockKiosk!: jest.Mocked<KioskBrowser.Kiosk>;

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { assign: jest.fn() },
  });
  window.location.href = '/';
  mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  mockKiosk.getPrinterInfo.mockResolvedValue([
    fakePrinterInfo({ name: 'VxPrinter', connected: true }),
  ]);
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  MockDate.set(new Date('2020-11-03T22:22:00'));
  fetchMock.reset();
  fetchMock.get(
    '/convert/election/files',
    typedAs<VxFiles>({
      inputFiles: [{ name: 'name' }, { name: 'name' }],
      outputFiles: [{ name: 'name' }],
    })
  );
  fetchMock.get(
    '/convert/tallies/files',
    typedAs<VxFiles>({
      inputFiles: [{ name: 'name' }, { name: 'name' }],
      outputFiles: [{ name: 'name' }],
    })
  );
  fetchMock.get(
    '/machine-config',
    typedAs<MachineConfig>({
      machineId: '0000',
      codeVersion: 'TEST',
    })
  );
  (areVvsg2AuthFlowsEnabled as jest.Mock).mockImplementation(() => false);
});

afterEach(() => {
  delete window.kiosk;
  MockDate.reset();
});

async function createMemoryStorageWith({
  electionDefinition,
  crvFile,
}: {
  electionDefinition: ElectionDefinition;
  crvFile?: File;
}) {
  const storage = new MemoryStorage();
  await storage.set(electionDefinitionStorageKey, electionDefinition);
  if (crvFile) {
    const castVoteRecordFiles = await CastVoteRecordFiles.empty.add(
      crvFile,
      electionDefinition.election
    );
    await storage.set(cvrsStorageKey, castVoteRecordFiles.export());
  }
  await storage.set(configuredAtStorageKey, new Date().toISOString());
  return storage;
}

async function authenticateWithAdminCard(card: MemoryCard) {
  // Machine should be locked
  await screen.findByText('VxAdmin is Locked');
  card.insertCard({
    t: 'admin',
    h: eitherNeitherElectionDefinition.electionHash,
    p: '123456',
  });
  await advanceTimersAndPromises(1);
  await screen.findByText('Enter the card security code to unlock.');
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('2'));
  fireEvent.click(screen.getByText('3'));
  fireEvent.click(screen.getByText('4'));
  fireEvent.click(screen.getByText('5'));
  fireEvent.click(screen.getByText('6'));
}

// TODO: Update this function to check super admin PIN entry once super admin PINs have been
// implemented
async function authenticateWithSuperAdminCard(
  card: MemoryCard,
  expectLockScreenToStart = true
) {
  if (expectLockScreenToStart) {
    await screen.findByText('VxAdmin is Locked');
  }
  card.insertCard({
    t: 'superadmin',
    h: eitherNeitherElectionDefinition.electionHash,
  });
  await advanceTimersAndPromises(1);
}

test('create election works', async () => {
  jest.useFakeTimers();
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const { getByText, getAllByText, queryAllByText, getByTestId } = render(
    <App card={card} hardware={hardware} />
  );
  await screen.findByText('Create New Election Definition');
  fireEvent.click(getByText('Create New Election Definition'));

  await screen.findByText('Ballots');
  expect(mockKiosk.log).toHaveBeenCalledWith(
    expect.stringContaining(LogEventId.ElectionConfigured)
  );

  fireEvent.click(getByText('Ballots'));
  fireEvent.click(getAllByText('View Ballot')[0]);
  fireEvent.click(getByText('English/Spanish'));

  // You can view the advanced screen and export log files when there is an election.
  fireEvent.click(screen.getByText('Advanced'));
  fireEvent.click(screen.getByText('Export Log File'));
  await screen.findByText('No Log File Present');
  fireEvent.click(screen.getByText('Close'));
  fireEvent.click(screen.getByText('Export Log File as CDF'));
  await screen.findByText('No Log File Present');

  fireEvent.click(getByText('Definition'));

  // Verify editing an election is disabled
  fireEvent.click(getByText('View Definition JSON'));
  expect(queryAllByText('Save').length).toBe(0);
  expect(queryAllByText('Reset').length).toBe(0);
  expect(getByTestId('json-input').hasAttribute('disabled')).toBe(true);

  // remove the election
  fireEvent.click(getByText('Remove'));
  fireEvent.click(getByText('Remove Election Definition'));

  await screen.findByText('Configure VxAdmin');
  expect(mockKiosk.log).toHaveBeenCalledWith(
    expect.stringContaining(LogEventId.ElectionUnconfigured)
  );

  // You can view the advanced screen and export log files when there is no election.
  fireEvent.click(screen.getByText('Advanced'));
  fireEvent.click(screen.getByText('Export Log File'));
  await screen.findByText('No Log File Present');
  fireEvent.click(screen.getByText('Close'));
  fireEvent.click(screen.getByText('Export Log File as CDF'));
  // You can not export as CDF when there is no election.
  expect(screen.queryAllByText('No Log File Present')).toHaveLength(0);

  fireEvent.click(screen.getByText('Configure'));
  await screen.findByText('Create New Election Definition');
});

test('authentication works', async () => {
  jest.useFakeTimers();
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
  });
  render(<App card={card} hardware={hardware} storage={storage} />);

  await screen.findByText('VxAdmin is Locked');
  const adminCard: AdminCardData = {
    t: 'admin',
    h: eitherNeitherElectionDefinition.electionHash,
    p: '123456',
  };
  const pollWorkerCard: PollworkerCardData = {
    t: 'pollworker',
    h: eitherNeitherElectionDefinition.electionHash,
  };

  // Disconnect card reader
  act(() => hardware.setCardReaderConnected(false));
  await advanceTimersAndPromises(1);
  await screen.findByText('Card Reader Not Detected');
  act(() => hardware.setCardReaderConnected(true));
  await advanceTimersAndPromises(1);
  await screen.findByText('VxAdmin is Locked');

  // Insert an admin card and enter the wrong code.
  card.insertCard(adminCard);
  await advanceTimersAndPromises(1);
  expect(mockKiosk.log).toHaveBeenCalledWith(
    expect.stringContaining(LogEventId.AdminCardInserted)
  );
  await screen.findByText('Enter the card security code to unlock.');
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  await screen.findByText('Invalid code. Please try again.');
  expect(mockKiosk.log).toHaveBeenLastCalledWith(
    expect.stringMatching(/"admin-authentication-2fac".*disposition":"failure"/)
  );

  // Remove card and insert a pollworker card.
  card.removeCard();
  await advanceTimersAndPromises(1);
  await screen.findByText('VxAdmin is Locked');
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Invalid Card');
  card.removeCard();
  await advanceTimersAndPromises(1);

  // Insert admin card and enter correct code.
  card.insertCard(adminCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Enter the card security code to unlock.');
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('2'));
  fireEvent.click(screen.getByText('3'));
  fireEvent.click(screen.getByText('4'));
  fireEvent.click(screen.getByText('5'));
  fireEvent.click(screen.getByText('6'));

  // Machine should be unlocked
  await screen.findByText('Definition');
  expect(mockKiosk.log).toHaveBeenCalledWith(
    expect.stringMatching(/"admin-authentication-2fac".*disposition":"success"/)
  );
  expect(mockKiosk.log).toHaveBeenLastCalledWith(
    expect.stringMatching(
      /"user-session-activation".*"user":"admin".*disposition":"success"/
    )
  );

  // The card can be removed and the screen will stay unlocked
  card.removeCard();
  await advanceTimersAndPromises(1);
  await screen.findByText('Definition');

  // The card and other cards can be inserted with no impact.
  card.insertCard(adminCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Definition');
  card.removeCard();
  await advanceTimersAndPromises(1);
  await screen.findByText('Definition');
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Definition');
  card.removeCard();
  await advanceTimersAndPromises(1);

  // Lock the machine
  fireEvent.click(screen.getByText('Lock Machine'));
  await screen.findByText('VxAdmin is Locked');
  expect(mockKiosk.log).toHaveBeenCalledWith(
    expect.stringContaining(LogEventId.MachineLocked)
  );
});

test('L&A (logic and accuracy) flow', async () => {
  // TODO: Move common setup logic to a beforeEach block
  jest.useFakeTimers();
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const printer = fakePrinter();
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
  });
  const { container, getByTestId } = render(
    <App card={card} hardware={hardware} printer={printer} storage={storage} />
  );
  await authenticateWithAdminCard(card);

  userEvent.click(screen.getByText('L&A'));

  // Test printing L&A package
  userEvent.click(screen.getByText('Print L&A Packages'));
  userEvent.click(screen.getByText('District 5'));

  // L&A package: Tally report
  await screen.findByText('Printing L&A Package for District 5', {
    exact: false,
  });
  expect(printer.print).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(mockKiosk.log).toHaveBeenCalledWith(
      expect.stringContaining(LogEventId.TestDeckTallyReportPrinted)
    )
  );
  expect(container).toMatchSnapshot();
  jest.advanceTimersByTime(5000);

  // L&A package: BMD test deck
  await screen.findByText('Printing L&A Package for District 5', {
    exact: false,
  });
  expect(printer.print).toHaveBeenCalledTimes(2);
  await waitFor(() =>
    expect(mockKiosk.log).toHaveBeenCalledWith(
      expect.stringContaining(LogEventId.TestDeckPrinted)
    )
  );
  expect(mockKiosk.log).toHaveBeenCalledWith(
    expect.stringContaining('BMD paper ballot test deck')
  );
  expect(container).toMatchSnapshot();
  jest.advanceTimersByTime(30000);

  // L&A package: HMPB test deck
  await screen.findByText('Printing L&A Package for District 5', {
    exact: false,
  });
  expect(printer.print).toHaveBeenCalledTimes(3);
  await waitFor(() =>
    expect(mockKiosk.log).toHaveBeenCalledWith(
      expect.stringContaining(LogEventId.TestDeckPrinted)
    )
  );
  expect(mockKiosk.log).toHaveBeenCalledWith(
    expect.stringContaining('Hand-marked paper ballot test deck')
  );
  expect(container).toMatchSnapshot();

  // Test printing full test deck tally
  const expectedTallies: { [tally: string]: number } = {
    '104': 6,
    '52': 12,
    '36': 2,
    '24': 2,
    '12': 3,
    '8': 1,
    '4': 1,
    '0': 10,
  };
  userEvent.click(screen.getByText('L&A'));
  userEvent.click(screen.getByText('Print Full Test Deck Tally Report'));
  await waitFor(() => {
    const fullTestDeckTallyReport = getByTestId('full-test-deck-tally-report');
    for (const [tally, times] of Object.entries(expectedTallies)) {
      expect(domGetAllByText(fullTestDeckTallyReport, tally).length).toEqual(
        times
      );
    }
  });
  await screen.findByText('Printing');
  expect(printer.print).toHaveBeenCalledTimes(4);
  expect(mockKiosk.log).toHaveBeenCalledWith(
    expect.stringContaining(LogEventId.TestDeckTallyReportPrinted)
  );
});

test('L&A features are available after test results are loaded', async () => {
  jest.useFakeTimers();
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
    crvFile: EITHER_NEITHER_CVR_TEST_FILE,
  });
  render(<App card={card} hardware={hardware} storage={storage} />);

  await authenticateWithAdminCard(card);

  // Confirm that test results are loaded
  userEvent.click(screen.getByText('Tally'));
  await waitFor(() =>
    expect(screen.getByTestId('total-ballot-count').textContent).toEqual('100')
  );
  screen.getByText('Currently tallying test ballots.', { exact: false });

  // Confirm that L&A materials are available
  userEvent.click(screen.getByText('L&A'));
  screen.getByText('Print L&A Packages');
  screen.getByText('Print Full Test Deck Tally Report');
});

test('printing ballots and printed ballots report', async () => {
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
  });
  jest.useFakeTimers();

  const printer = fakePrinter();
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const { getByText, getAllByText, queryAllByText, getAllByTestId } = render(
    <App storage={storage} printer={printer} card={card} hardware={hardware} />
  );
  jest.advanceTimersByTime(2000); // Cause the usb drive to be detected
  await authenticateWithAdminCard(card);

  await screen.findByText('0 official ballots');

  getByText('Mock General Election Choctaw 2020');
  getByText(
    hasTextAcrossElements(
      `Election ID${eitherNeitherElectionDefinition.electionHash.slice(0, 10)}`
    )
  );

  fireEvent.click(getByText('Ballots'));
  fireEvent.click(getAllByText('View Ballot')[0]);
  fireEvent.click(getByText('Precinct'));
  fireEvent.click(getByText('Absentee'));
  fireEvent.click(getByText('Test'));
  fireEvent.click(getByText('Official'));
  fireEvent.click(getByText('Print 1 Official', { exact: false }));
  await waitFor(() => getByText('Printing'));
  expect(printer.print).toHaveBeenCalledTimes(1);
  expect(mockKiosk.log).toHaveBeenCalledWith(
    expect.stringContaining(LogEventId.BallotPrinted)
  );
  fireEvent.click(getByText('Print 1 Official', { exact: false }));
  await waitFor(() => getByText('Printing'));
  expect(printer.print).toHaveBeenCalledTimes(2);
  fireEvent.click(getByText('Precinct'));
  fireEvent.click(getByText('Print 1 Official', { exact: false }));
  await waitFor(() => getByText('Printing'));
  expect(printer.print).toHaveBeenCalledTimes(3);

  await waitFor(() => !getByText('Printing'));

  fireEvent.click(getByText('Ballots'));
  getByText('3 official ballots', { exact: false });
  fireEvent.click(getByText('Printed Ballots Report'));
  expect(getAllByText(/2 absentee ballots/).length).toBe(2);
  expect(getAllByText(/1 precinct ballot/).length).toBe(2);
  const tableRow = getAllByTestId('row-6538-4')[0]; // Row in the printed ballot report for the Bywy ballots printed earlier
  expect(
    domGetAllByRole(tableRow, 'cell', { hidden: true })!.map(
      (column) => column.textContent
    )
  ).toStrictEqual(['Bywy', '4', '2', '1', '3']);
  fireEvent.click(queryAllByText('Print Report')[0]);

  await waitFor(() => getByText('Printing'));
  expect(printer.print).toHaveBeenCalledTimes(4);
  expect(mockKiosk.log).toHaveBeenCalledWith(
    expect.stringContaining(LogEventId.PrintedBallotReportPrinted)
  );
});

test('tabulating CVRs', async () => {
  jest.useFakeTimers();
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
    crvFile: EITHER_NEITHER_CVR_FILE,
  });

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const printer = fakePrinter();
  const { getByText, getAllByText, getByTestId, queryByText } = render(
    <App storage={storage} card={card} hardware={hardware} printer={printer} />
  );
  jest.advanceTimersByTime(2000); // Cause the usb drive to be detected
  await authenticateWithAdminCard(card);

  await screen.findByText('0 official ballots');

  fireEvent.click(getByText('Tally'));

  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('100')
  );

  getByText('View Unofficial Full Election Tally Report');
  fireEvent.click(getByText('Mark Tally Results as Official'));
  getByText('Mark Unofficial Tally Results as Official Tally Results?');
  const modal = await screen.findByRole('alertdialog');
  fireEvent.click(within(modal).getByText('Mark Tally Results as Official'));
  expect(mockKiosk.log).toHaveBeenCalledWith(
    expect.stringContaining(LogEventId.MarkedTallyResultsOfficial)
  );

  fireEvent.click(getByText('View Official Full Election Tally Report'));

  expect(
    getAllByText('Official Mock General Election Choctaw 2020 Tally Report')
      .length > 0
  ).toBe(true);
  // TODO: Snapshots without clear definition of what they are for cause future developers to have to figure out what the test is for each time this test breaks.
  expect(getByTestId('election-full-tally-report')).toMatchSnapshot();
  fireEvent.click(getByText('Preview Report'));
  expect(mockKiosk.log).toHaveBeenCalledWith(
    expect.stringContaining(LogEventId.TallyReportPreviewed)
  );

  fireEvent.click(getByText('Tally'));

  fireEvent.click(getByText('Show Results by Batch and Scanner'));
  getByText('Batch Name');
  fireEvent.click(getByText('Export Batch Results as CSV'));
  jest.advanceTimersByTime(2000);
  getByText('Save Batch Results');
  getByText(/Save the election batch results as /);
  getByText(
    'votingworks-live-batch-results_choctaw-county_mock-general-election-choctaw-2020_2020-11-03_22-22-00.csv'
  );

  fireEvent.click(getByText('Save'));
  await waitFor(() => getByText(/Saving/));
  jest.advanceTimersByTime(2000);
  await waitFor(() => getByText(/Batch Results Saved/));
  await waitFor(() => {
    expect(mockKiosk.writeFile).toHaveBeenCalledTimes(1);
    expect(mockKiosk.writeFile).toHaveBeenNthCalledWith(
      1,
      'fake mount point/votingworks-live-batch-results_choctaw-county_mock-general-election-choctaw-2020_2020-11-03_22-22-00.csv',
      expect.stringContaining(
        'Batch ID,Batch Name,Tabulator,Number of Ballots,President - Ballots Cast'
      )
    );
  });
  expect(mockKiosk.log).toHaveBeenCalledWith(
    expect.stringContaining(LogEventId.FileSaved)
  );

  fireEvent.click(getByText('View Official Batch 2 Tally Report'));
  getByText('Official Batch Tally Report for Batch 2 (Scanner: scanner-1)');
  expect(getByTestId('total')).toHaveTextContent('4');

  fireEvent.click(getByText('Back to Tally Index'));

  await waitFor(() => {
    fireEvent.click(getByText('View Official Tally Reports for All Precincts'));
  });

  getByText(
    'Official Mock General Election Choctaw 2020 Tally Reports for All Precincts'
  );
  // Test that each precinct has a tally report generated
  for (const p of eitherNeitherElectionDefinition.election.precincts) {
    getByText(`Official Precinct Tally Report for: ${p.name}`);
  }
  // The election title is written one extra time in the footer of the page.
  expect(getAllByText('Mock General Election Choctaw 2020').length).toBe(
    eitherNeitherElectionDefinition.election.precincts.length + 1
  );

  // Save SEMS file
  fetchMock.post('/convert/tallies/submitfile', { body: { status: 'ok' } });
  fetchMock.post('/convert/tallies/process', { body: { status: 'ok' } });

  fetchMock.getOnce('/convert/tallies/output?name=name', {
    body: 'test-content',
  });

  fetchMock.post('/convert/reset', { body: { status: 'ok' } });
  fireEvent.click(getByText('Tally'));
  await waitFor(() => getByText('Save Results File'));
  fireEvent.click(getByText('Save Results File'));
  jest.advanceTimersByTime(2000);
  getByText('Save Results');
  getByText(/Save the election results as /);
  getByText(
    'votingworks-live-results_choctaw-county_mock-general-election-choctaw-2020_2020-11-03_22-22-00.csv'
  );

  fireEvent.click(getByText('Save'));
  await waitFor(() => getByText(/Saving/));
  jest.advanceTimersByTime(2000);
  await waitFor(() => getByText(/Results Saved/));
  await waitFor(() => {
    expect(mockKiosk.writeFile).toHaveBeenCalledTimes(2);
    expect(mockKiosk.writeFile).toHaveBeenNthCalledWith(
      2,
      'fake mount point/votingworks-live-results_choctaw-county_mock-general-election-choctaw-2020_2020-11-03_22-22-00.csv',
      'test-content'
    );
  });
  expect(mockKiosk.log).toHaveBeenCalledWith(
    expect.stringContaining(LogEventId.ConvertingResultsToSemsFormat)
  );
  expect(fetchMock.called('/convert/tallies/files')).toBe(true);
  expect(fetchMock.called('/convert/tallies/submitfile')).toBe(true);
  expect(fetchMock.called('/convert/tallies/process')).toBe(true);
  expect(fetchMock.called('/convert/tallies/output?name=name')).toBe(true);
  expect(fetchMock.called('/convert/reset')).toBe(true);

  fireEvent.click(getByText('Close'));

  // Confirm that L&A Materials are unavailable after live CVRs have been loaded
  fireEvent.click(getByText('L&A'));
  getByText('L&A materials are not available', { exact: false });
  expect(queryByText('Print L&A Packages')).not.toBeInTheDocument();
  expect(
    queryByText('Print Full Test Deck Tally Report')
  ).not.toBeInTheDocument();

  // Clear results
  fireEvent.click(getByText('Tally'));
  fireEvent.click(getByText('Clear All Results'));
  fireEvent.click(getByText('Remove All Data'));
  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('0')
  );
  expect(mockKiosk.log).toHaveBeenCalledWith(
    expect.stringContaining(LogEventId.RemovedTallyFile)
  );

  // When there are no CVRs imported the full tally report is labeled as the zero report
  fireEvent.click(getByText('View Unofficial Full Election Tally Report'));
  // Verify the zero report generates properly
  expect(getAllByText('0').length).toBe(40);
});

test('tabulating CVRs with SEMS file', async () => {
  jest.useFakeTimers();
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
    crvFile: EITHER_NEITHER_CVR_FILE,
  });

  const semsFileStorageString = convertSemsFileToExternalTally(
    EITHER_NEITHER_SEMS_DATA,
    eitherNeitherElectionDefinition.election,
    VotingMethod.Precinct,
    'sems-results.csv',
    new Date()
  );
  await storage.set(
    externalVoteTalliesFileStorageKey,
    convertExternalTalliesToStorageString([semsFileStorageString])
  );

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const { getByText, getByTestId, getAllByTestId, getAllByText } = render(
    <App storage={storage} card={card} hardware={hardware} />
  );
  jest.advanceTimersByTime(2000);
  await authenticateWithAdminCard(card);

  await screen.findByText('0 official ballots');

  fireEvent.click(getByText('Tally'));

  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('200')
  );
  expect(getAllByText('External Results (sems-results.csv)').length).toBe(2);

  fireEvent.click(getByText('View Unofficial Full Election Tally Report'));

  const ballotsByVotingMethod = getAllByTestId('voting-method-table');
  expect(ballotsByVotingMethod.length).toBe(1);
  const absenteeRow = domGetByTestId(ballotsByVotingMethod[0], 'absentee');
  domGetByText(absenteeRow, 'Absentee');
  domGetByText(absenteeRow, '50');

  const precinctRow = domGetByTestId(ballotsByVotingMethod[0], 'standard');
  domGetByText(precinctRow, 'Precinct');
  domGetByText(precinctRow, '150');

  const totalRow = domGetByTestId(ballotsByVotingMethod[0], 'total');
  domGetByText(totalRow, 'Total Ballots Cast');
  domGetByText(totalRow, '200');
  // TODO: Snapshots without clear definition of what they are for cause future developers to have to figure out what the test is for each time this test breaks.
  expect(getByTestId('election-full-tally-report')).toMatchSnapshot();
  fireEvent.click(getByText('Back to Tally Index'));

  // Test exporting the final results
  fetchMock.post('/convert/tallies/submitfile', { body: { status: 'ok' } });
  fetchMock.post('/convert/tallies/process', { body: { status: 'ok' } });

  fetchMock.getOnce('/convert/tallies/output?name=name', {
    body: 'test-content',
  });

  fetchMock.post('/convert/reset', { body: { status: 'ok' } });
  await waitFor(() => getByText('Save Results File'));
  fireEvent.click(getByText('Save Results File'));
  jest.advanceTimersByTime(2000);
  getByText('Save Results');
  getByText(/Save the election results as /);
  getByText(
    'votingworks-live-results_choctaw-county_mock-general-election-choctaw-2020_2020-11-03_22-22-00.csv'
  );

  fireEvent.click(getByText('Save'));
  await waitFor(() => getByText(/Saving/));
  jest.advanceTimersByTime(2000);
  await waitFor(() => getByText(/Results Saved/));
  await waitFor(() => {
    expect(mockKiosk.writeFile).toHaveBeenCalledTimes(1);
    expect(mockKiosk.writeFile).toHaveBeenNthCalledWith(
      1,
      'fake mount point/votingworks-live-results_choctaw-county_mock-general-election-choctaw-2020_2020-11-03_22-22-00.csv',
      'test-content'
    );
  });
  expect(fetchMock.called('/convert/tallies/files')).toBe(true);
  expect(fetchMock.called('/convert/tallies/submitfile')).toBe(true);
  expect(fetchMock.called('/convert/tallies/process')).toBe(true);
  expect(fetchMock.called('/convert/tallies/output?name=name')).toBe(true);
  expect(fetchMock.called('/convert/reset')).toBe(true);

  fireEvent.click(getByText('Close'));

  // Test removing the SEMS file
  fireEvent.click(getByText('Remove External Results File'));
  fireEvent.click(getByText('Remove External Files'));

  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('100')
  );

  fireEvent.click(getByText('View Unofficial Full Election Tally Report'));
});

test('tabulating CVRs with SEMS file and manual data', async () => {
  jest.useFakeTimers();
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
    crvFile: EITHER_NEITHER_CVR_FILE,
  });

  const semsFileStorageString = convertSemsFileToExternalTally(
    EITHER_NEITHER_SEMS_DATA,
    eitherNeitherElectionDefinition.election,
    VotingMethod.Precinct,
    'sems-results.csv',
    new Date()
  );
  await storage.set(
    externalVoteTalliesFileStorageKey,
    convertExternalTalliesToStorageString([semsFileStorageString])
  );

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();

  const {
    getByText,
    getByTestId,
    getAllByText,
    getAllByTestId,
    queryAllByText,
  } = render(<App storage={storage} card={card} hardware={hardware} />);
  await authenticateWithAdminCard(card);

  await screen.findByText('0 official ballots');

  fireEvent.click(getByText('Tally'));

  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('200')
  );

  fireEvent.click(getByText('Add Manually Entered Results'));
  getByText('Manually Entered Precinct Results');
  fireEvent.click(getByText('Edit Precinct Results for District 5'));
  getByText('Save Precinct Results for District 5');
  fireEvent.change(getByTestId('775020876-undervotes'), {
    target: { value: '12' },
  });
  fireEvent.change(getByTestId('775020876-overvotes'), {
    target: { value: '8' },
  });
  fireEvent.change(getByTestId('775020876-775031988'), {
    target: { value: '32' },
  });
  fireEvent.change(getByTestId('775020876-775031987'), {
    target: { value: '28' },
  });
  fireEvent.change(getByTestId('775020876-775031989'), {
    target: { value: '10' },
  });
  fireEvent.change(getByTestId('775020876-write-in'), {
    target: { value: '10' },
  });

  fireEvent.click(getByText('Save Precinct Results for District 5'));
  await waitFor(() => getByText('Manually Entered Precinct Results'));
  await waitFor(() => {
    expect(getByTestId('total-ballots-entered').textContent).toEqual('100');
  });
  fireEvent.click(getByText('Back to Tally'));
  await waitFor(() => {
    expect(getByTestId('total-ballot-count').textContent).toEqual('300');
  });
  expect(getAllByText('External Results (Manually Added Data)').length).toBe(2);

  const fileTable = getByTestId('loaded-file-table');
  const manualRow = domGetByText(
    fileTable,
    'External Results (Manually Added Data)'
  ).closest('tr')!;
  domGetByText(manualRow, '100');
  domGetByText(manualRow, 'District 5');

  fireEvent.click(getByText('View Unofficial Full Election Tally Report'));
  const ballotsByVotingMethod = getAllByTestId('voting-method-table');
  expect(ballotsByVotingMethod.length).toBe(1);
  const absenteeRow = domGetByTestId(ballotsByVotingMethod[0], 'absentee');
  domGetByText(absenteeRow, 'Absentee');
  domGetByText(absenteeRow, '50');

  const precinctRow = domGetByTestId(ballotsByVotingMethod[0], 'standard');
  domGetByText(precinctRow, 'Precinct');
  domGetByText(precinctRow, '250');

  const totalRow = domGetByTestId(ballotsByVotingMethod[0], 'total');
  domGetByText(totalRow, 'Total Ballots Cast');
  domGetByText(totalRow, '300');

  // Now edit the manual data
  fireEvent.click(getByText('Back to Tally Index'));
  fireEvent.click(getByText('Edit Manually Entered Results'));

  // Existing data is still there
  const district5Row = getByText('District 5').closest('tr')!;
  expect(domGetByTestId(district5Row, 'numBallots')!.textContent).toEqual(
    '100'
  );

  // Change the manual data to absentee
  fireEvent.click(getByText('Absentee Results'));

  await advanceTimersAndPromises(0);
  // Change to another precinct
  fireEvent.click(getByText('Edit Absentee Results for Panhandle'));
  getByText('Save Absentee Results for Panhandle');
  fireEvent.change(getByTestId('750000017-undervotes'), {
    target: { value: '17' },
  });
  fireEvent.change(getByTestId('750000017-overvotes'), {
    target: { value: '3' },
  });
  fireEvent.change(getByTestId('750000017-yes'), {
    target: { value: '54' },
  });
  fireEvent.change(getByTestId('750000017-no'), {
    target: { value: '26' },
  });

  fireEvent.click(getByText('Save Absentee Results for Panhandle'));
  await waitFor(() => {
    expect(getByTestId('total-ballots-entered').textContent).toEqual('200');
  });
  fireEvent.click(getByText('Back to Tally'));

  await waitFor(() => {
    expect(getByTestId('total-ballot-count').textContent).toEqual('400');
  });
  expect(getAllByText('External Results (Manually Added Data)').length).toBe(2);

  const fileTable2 = getByTestId('loaded-file-table');
  const manualRow2 = domGetByText(
    fileTable2,
    'External Results (Manually Added Data)'
  ).closest('tr')!;
  domGetByText(manualRow2, '200');
  domGetByText(manualRow2, 'District 5, Panhandle');

  fireEvent.click(getByText('View Unofficial Full Election Tally Report'));
  const ballotsByVotingMethod2 = getAllByTestId('voting-method-table');
  expect(ballotsByVotingMethod2.length).toBe(1);
  const absenteeRow2 = domGetByTestId(ballotsByVotingMethod2[0], 'absentee');
  domGetByText(absenteeRow2, 'Absentee');
  domGetByText(absenteeRow2, '250');

  const precinctRow2 = domGetByTestId(ballotsByVotingMethod2[0], 'standard');
  domGetByText(precinctRow2, 'Precinct');
  domGetByText(precinctRow2, '150');

  const totalRow2 = domGetByTestId(ballotsByVotingMethod2[0], 'total');
  domGetByText(totalRow2, 'Total Ballots Cast');
  domGetByText(totalRow2, '400');

  // Remove the manual data
  fireEvent.click(getByText('Back to Tally Index'));
  fireEvent.click(getByText('Remove Manual Data'));

  getByText('Do you want to remove the manually entered data?');
  const modal = await screen.findByRole('alertdialog');
  fireEvent.click(within(modal).getByText('Remove Manual Data'));
  await waitFor(() => {
    expect(getByTestId('total-ballot-count').textContent).toEqual('200');
  });
  expect(queryAllByText('External Results (Manually Added Data)').length).toBe(
    0
  );
});

test('changing election resets sems, cvr, and manual data files', async () => {
  jest.useFakeTimers();
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
    crvFile: EITHER_NEITHER_CVR_FILE,
  });

  const semsFileTally = convertSemsFileToExternalTally(
    EITHER_NEITHER_SEMS_DATA,
    eitherNeitherElectionDefinition.election,
    VotingMethod.Precinct,
    'sems-results.csv',
    new Date()
  );
  const manualTally = convertTalliesByPrecinctToFullExternalTally(
    { '6522': { contestTallies: {}, numberOfBallotsCounted: 100 } },
    eitherNeitherElectionDefinition.election,
    VotingMethod.Absentee,
    ExternalTallySourceType.Manual,
    'Manually Added Data',
    new Date()
  );
  await storage.set(
    externalVoteTalliesFileStorageKey,
    convertExternalTalliesToStorageString([semsFileTally, manualTally])
  );

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();

  const { getByText, getByTestId } = render(
    <App storage={storage} card={card} hardware={hardware} />
  );

  await authenticateWithAdminCard(card);
  await screen.findByText('0 official ballots');

  fireEvent.click(getByText('Tally'));

  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('300')
  );

  fireEvent.click(getByText('Definition'));
  fireEvent.click(getByText('Remove Election'));
  fireEvent.click(getByText('Remove Election Definition'));
  await waitFor(() => {
    fireEvent.click(getByText('Create New Election Definition'));
  });
  fireEvent.click(getByText('Tally'));

  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('0')
  );
  getByText('No CVR files loaded.');
});

test('clearing all files after marking as official clears SEMS, CVR, and manual file', async () => {
  jest.useFakeTimers();
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
    crvFile: EITHER_NEITHER_CVR_FILE,
  });

  const semsFileTally = convertSemsFileToExternalTally(
    EITHER_NEITHER_SEMS_DATA,
    eitherNeitherElectionDefinition.election,
    VotingMethod.Precinct,
    'sems-results.csv',
    new Date()
  );
  const manualTally = convertTalliesByPrecinctToFullExternalTally(
    { '6522': { contestTallies: {}, numberOfBallotsCounted: 100 } },
    eitherNeitherElectionDefinition.election,
    VotingMethod.Absentee,
    ExternalTallySourceType.Manual,
    'Manually Added Data',
    new Date()
  );
  await storage.set(
    externalVoteTalliesFileStorageKey,
    convertExternalTalliesToStorageString([semsFileTally, manualTally])
  );

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const { getByText, getByTestId } = render(
    <App
      storage={storage}
      card={card}
      hardware={hardware}
      converter="ms-sems"
    />
  );
  await authenticateWithAdminCard(card);
  await screen.findByText('0 official ballots');

  fireEvent.click(getByText('Tally'));

  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('300')
  );

  fireEvent.click(getByText('Tally'));
  fireEvent.click(getByText('Mark Tally Results as Official'));
  const modal = await screen.findByRole('alertdialog');
  fireEvent.click(within(modal).getByText('Mark Tally Results as Official'));

  getByText('View Official Full Election Tally Report');
  expect(getByText('Import CVR Files').closest('button')).toBeDisabled();
  expect(getByTestId('import-sems-button')).toBeDisabled();

  fireEvent.click(getByText('Clear All Results'));
  getByText(
    'Do you want to remove the 1 uploaded CVR file, the external results file sems-results.csv, and the manually entered data?'
  );
  fireEvent.click(getByText('Remove All Data'));

  await waitFor(() =>
    expect(getByText('Remove CVR Files').closest('button')).toBeDisabled()
  );
  expect(
    getByText('Remove External Results File').closest('button')
  ).toBeDisabled();

  expect(getByText('Import CVR Files').closest('button')).toBeEnabled();
  expect(getByTestId('import-sems-button')).toBeEnabled();

  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('0')
  );
  getByText('No CVR files loaded.');
});

test('admin UI has expected nav when VVSG2 auth flows are enabled', async () => {
  jest.useFakeTimers();
  (areVvsg2AuthFlowsEnabled as jest.Mock).mockImplementation(() => true);

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
  });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await authenticateWithAdminCard(card);

  screen.getByText('Ballots');
  screen.getByText('L&A');
  screen.getByText('Tally');
  screen.getByRole('button', { name: 'Lock Machine' });

  expect(screen.queryByText('Definition')).not.toBeInTheDocument();
  expect(screen.queryByText('Smartcards')).not.toBeInTheDocument();
  expect(screen.queryByText('Advanced')).not.toBeInTheDocument();
});

test('super admin UI has expected nav when VVSG2 auth flows are enabled', async () => {
  jest.useFakeTimers();
  (areVvsg2AuthFlowsEnabled as jest.Mock).mockImplementation(() => true);

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
  });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await authenticateWithSuperAdminCard(card);

  screen.getByText('Definition');
  screen.getByText('Draft Ballots');
  screen.getByText('Smartcards');
  screen.getByRole('button', { name: 'Settings' });
  screen.getByRole('button', { name: 'Logs' });
  screen.getByRole('button', { name: 'Lock Machine' });
});

test('super admin UI has expected nav when no election and VVSG2 auth flows are enabled', async () => {
  jest.useFakeTimers();
  (areVvsg2AuthFlowsEnabled as jest.Mock).mockImplementation(() => true);

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  render(<App card={card} hardware={hardware} />);
  await authenticateWithSuperAdminCard(card, false);

  screen.getByText('Definition');
  screen.getByRole('button', { name: 'Settings' });
  screen.getByRole('button', { name: 'Logs' });
  screen.getByRole('button', { name: 'Lock Machine' });

  expect(screen.queryByText('Draft Ballots')).not.toBeInTheDocument();
  expect(screen.queryByText('Smartcards')).not.toBeInTheDocument();
});
