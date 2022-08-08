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
import {
  electionWithMsEitherNeitherFixtures,
  electionSampleDefinition,
} from '@votingworks/fixtures';
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
  makeElectionManagerCard,
  mockOf,
} from '@votingworks/test-utils';
import {
  ElectionManagerCardData,
  ExternalTallySourceType,
  PollWorkerCardData,
  VotingMethod,
} from '@votingworks/types';
import { LogEventId } from '@votingworks/logging';
import { areVvsg2AuthFlowsEnabled } from '@votingworks/ui';

import { externalVoteTalliesFileStorageKey } from './app_root';
import { App } from './app';
import { fakePrinter } from '../test/helpers/fake_printer';
import { loadBallotSealImages } from '../test/util/load_ballot_seal_images';
import { eitherNeitherElectionDefinition } from '../test/render_in_app_context';
import { convertSemsFileToExternalTally } from './utils/sems_tallies';
import {
  convertExternalTalliesToStorageString,
  convertTalliesByPrecinctToFullExternalTally,
} from './utils/external_tallies';
import { MachineConfig } from './config/types';
import { VxFiles } from './lib/converters';
import { createMemoryStorageWith } from '../test/util/create_memory_storage_with';
import {
  authenticateWithElectionManagerCard,
  authenticateWithSystemAdministratorCard,
} from '../test/util/authenticate';

const EITHER_NEITHER_CVR_DATA = electionWithMsEitherNeitherFixtures.cvrData;
const EITHER_NEITHER_CVR_FILE = new File([EITHER_NEITHER_CVR_DATA], 'cvrs.txt');

const EITHER_NEITHER_CVR_TEST_DATA =
  electionWithMsEitherNeitherFixtures.cvrTestData;
const EITHER_NEITHER_CVR_TEST_FILE = new File(
  [EITHER_NEITHER_CVR_TEST_DATA],
  'cvrs.txt'
);

const EITHER_NEITHER_SEMS_DATA = electionWithMsEitherNeitherFixtures.semsData;

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
jest.mock('@votingworks/ui', (): typeof import('@votingworks/ui') => {
  const original: typeof import('@votingworks/ui') =
    jest.requireActual('@votingworks/ui');
  return {
    ...original,
    areVvsg2AuthFlowsEnabled: jest.fn(),
  };
});

function enableVvsg2AuthFlows() {
  mockOf(areVvsg2AuthFlowsEnabled).mockImplementation(() => true);
  process.env['REACT_APP_VX_ENABLE_VVSG2_AUTH_FLOWS'] = 'true';
}

function disableVvsg2AuthFlows() {
  mockOf(areVvsg2AuthFlowsEnabled).mockImplementation(() => false);
  process.env['REACT_APP_VX_ENABLE_VVSG2_AUTH_FLOWS'] = undefined;
}

let mockKiosk!: jest.Mocked<KioskBrowser.Kiosk>;

beforeEach(() => {
  jest.useFakeTimers();

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
  fetchMock.get('/admin/write-ins/cvrs/reset', { body: { status: 'ok ' } });
  disableVvsg2AuthFlows();
});

afterEach(() => {
  delete window.kiosk;
  MockDate.reset();
});

test('create election works', async () => {
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
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
  });
  render(<App card={card} hardware={hardware} storage={storage} />);

  await screen.findByText('VxAdmin is Locked');
  const electionManagerCard: ElectionManagerCardData = {
    t: 'election_manager',
    h: eitherNeitherElectionDefinition.electionHash,
    p: '123456',
  };
  const pollWorkerCard: PollWorkerCardData = {
    t: 'poll_worker',
    h: eitherNeitherElectionDefinition.electionHash,
  };

  // Disconnect card reader
  act(() => hardware.setCardReaderConnected(false));
  await advanceTimersAndPromises(1);
  await screen.findByText('Card Reader Not Detected');
  act(() => hardware.setCardReaderConnected(true));
  await advanceTimersAndPromises(1);
  await screen.findByText('VxAdmin is Locked');

  // Insert an election manager card and enter the wrong code.
  card.insertCard(electionManagerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Enter the card security code to unlock.');
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  await screen.findByText('Invalid code. Please try again.');
  expect(mockKiosk.log).toHaveBeenLastCalledWith(
    expect.stringMatching(/"auth-passcode-entry".*disposition":"failure"/)
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

  // Insert election manager card and enter correct code.
  card.insertCard(electionManagerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Enter the card security code to unlock.');
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('2'));
  fireEvent.click(screen.getByText('3'));
  fireEvent.click(screen.getByText('4'));
  fireEvent.click(screen.getByText('5'));
  fireEvent.click(screen.getByText('6'));

  // 'Remove Card' screen is shown after successful authentication.
  await screen.findByText('Remove card to continue.');
  card.removeCard();
  await screen.findByText('Lock Machine');

  expect(mockKiosk.log).toHaveBeenCalledWith(
    expect.stringMatching(/"auth-passcode-entry".*disposition":"success"/)
  );
  expect(mockKiosk.log).toHaveBeenCalledWith(
    expect.stringMatching(
      /"auth-login".*"user":"election_manager".*disposition":"success"/
    )
  );

  // Machine is unlocked when card removed
  card.removeCard();
  await advanceTimersAndPromises(1);
  await screen.findByText('Definition');

  // The card and other cards can be inserted with no impact.
  card.insertCard(electionManagerCard);
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
    expect.stringContaining(LogEventId.AuthLogout)
  );
});

test('L&A (logic and accuracy) flow', async () => {
  // TODO: Move common setup logic to a beforeEach block
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const printer = fakePrinter();
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
  });
  const { container, getByTestId } = render(
    <App card={card} hardware={hardware} printer={printer} storage={storage} />
  );
  await authenticateWithElectionManagerCard(
    card,
    eitherNeitherElectionDefinition
  );

  userEvent.click(screen.getByText('L&A'));

  // Test printing L&A package
  userEvent.click(screen.getByText('List Precinct L&A Packages'));
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
  loadBallotSealImages();
  await waitFor(() => expect(printer.print).toHaveBeenCalledTimes(2));
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
    '104': 10,
    '52': 12,
    '24': 6,
    '12': 4,
    '8': 3,
    '4': 2,
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
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
    crvFile: EITHER_NEITHER_CVR_TEST_FILE,
  });
  render(<App card={card} hardware={hardware} storage={storage} />);

  await authenticateWithElectionManagerCard(
    card,
    eitherNeitherElectionDefinition
  );

  // Confirm that test results are loaded
  userEvent.click(screen.getByText('Tally'));
  screen.getByText('Currently tallying test ballots.', { exact: false });
  expect(screen.getByTestId('total-cvr-count').textContent).toEqual('100');

  // Confirm that L&A materials are available
  userEvent.click(screen.getByText('L&A'));
  screen.getByText('List Precinct L&A Packages');
  screen.getByText('Print Full Test Deck Tally Report');
});

test('printing ballots and printed ballots report', async () => {
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
  });

  const printer = fakePrinter();
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const { getByText, getAllByText, queryAllByText, getAllByTestId } = render(
    <App storage={storage} printer={printer} card={card} hardware={hardware} />
  );
  jest.advanceTimersByTime(2000); // Cause the usb drive to be detected
  await authenticateWithElectionManagerCard(
    card,
    eitherNeitherElectionDefinition
  );

  fireEvent.click(getByText('Reports'));
  await screen.findByText('0 official ballots');

  fireEvent.click(getByText('Ballots'));
  fireEvent.click(getAllByText('View Ballot')[0]);
  fireEvent.click(getByText('Precinct'));
  fireEvent.click(getByText('Absentee'));
  fireEvent.click(getByText('Test'));
  fireEvent.click(getByText('Official'));
  fireEvent.click(getByText('Print 1', { exact: false }));
  await waitFor(() => getByText('Printing'));
  expect(printer.print).toHaveBeenCalledTimes(1);
  expect(mockKiosk.log).toHaveBeenCalledWith(
    expect.stringContaining(LogEventId.BallotPrinted)
  );
  fireEvent.click(getByText('Print 1', { exact: false }));
  await waitFor(() => getByText('Printing'));
  expect(printer.print).toHaveBeenCalledTimes(2);
  fireEvent.click(getByText('Precinct'));
  fireEvent.click(getByText('Print 1', { exact: false }));
  await waitFor(() => getByText('Printing'));
  expect(printer.print).toHaveBeenCalledTimes(3);

  await waitFor(() => !getByText('Printing'));

  fireEvent.click(getByText('Reports'));
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
  await authenticateWithElectionManagerCard(
    card,
    eitherNeitherElectionDefinition
  );

  fireEvent.click(getByText('Reports'));
  expect(getByTestId('total-ballot-count').textContent).toEqual('100');

  fireEvent.click(getByText('Unofficial Full Election Tally Report'));
  expect(mockKiosk.log).toHaveBeenCalledWith(
    expect.stringContaining(LogEventId.TallyReportPreviewed)
  );

  fireEvent.click(getByText('Mark Tally Results as Official'));
  getByText('Mark Unofficial Tally Results as Official Tally Results?');
  const modal = await screen.findByRole('alertdialog');
  fireEvent.click(within(modal).getByText('Mark Tally Results as Official'));
  expect(mockKiosk.log).toHaveBeenCalledWith(
    expect.stringContaining(LogEventId.MarkedTallyResultsOfficial)
  );

  // Report title should be rendered 3 times - app, preview, and printed
  expect(
    getAllByText('Official Mock General Election Choctaw 2020 Tally Report')
      .length
  ).toBe(3);

  // TODO: Snapshots without clear definition of what they are for cause future developers to have to figure out what the test is for each time this test breaks.
  const printableArea1 = getByTestId('printable-area');
  expect(
    within(printableArea1).getByTestId('election-full-tally-report')
  ).toMatchSnapshot();

  fireEvent.click(getByText('Reports'));

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

  fireEvent.click(getByText('Official Batch 2 Tally Report'));
  getByText('Official Batch Tally Report for Batch 2 (Scanner: scanner-1)');
  const printableArea2 = getByTestId('printable-area');
  const totalRow = within(printableArea2).getByTestId('total');
  expect(totalRow).toHaveTextContent('4');

  fireEvent.click(getByText('Back to Reports'));

  await waitFor(() => {
    fireEvent.click(getByText('Official Tally Reports for All Precincts'));
  });

  getByText(
    'Official Mock General Election Choctaw 2020 Tally Reports for All Precincts'
  );
  // Test that each precinct has a tally report generated and
  // rendered twice: once for preview and once for printing
  for (const p of eitherNeitherElectionDefinition.election.precincts) {
    expect(
      getAllByText(`Official Precinct Tally Report for: ${p.name}`).length
    ).toBe(2);
  }
  // The election title is written once for each precinct the preview, once for each
  // precinct in the printed report, and one extra time in the footer of the page.
  expect(getAllByText('Mock General Election Choctaw 2020').length).toBe(
    eitherNeitherElectionDefinition.election.precincts.length * 2 + 1
  );

  // Save SEMS file
  fetchMock.post('/convert/tallies/submitfile', { body: { status: 'ok' } });
  fetchMock.post('/convert/tallies/process', { body: { status: 'ok' } });

  fetchMock.getOnce('/convert/tallies/output?name=name', {
    body: 'test-content',
  });

  fetchMock.post('/convert/reset', { body: { status: 'ok' } });
  fireEvent.click(getByText('Reports'));
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
  getByText(
    'L&A testing documents are not available after official election CVRs have been imported.',
    { exact: false }
  );
  expect(queryByText('List Precinct L&A Packages')).not.toBeInTheDocument();
  expect(
    queryByText('Print Full Test Deck Tally Report')
  ).not.toBeInTheDocument();

  // Clear results
  fireEvent.click(getByText('Tally'));
  fireEvent.click(getByText('Clear All Tallies and Results'));
  fireEvent.click(getByText('Remove All Data'));
  await waitFor(() => expect(getByText('No CVR files loaded.')));
  expect(mockKiosk.log).toHaveBeenCalledWith(
    expect.stringContaining(LogEventId.RemovedTallyFile)
  );

  fireEvent.click(getByText('Reports'));
  expect(getByTestId('total-ballot-count').textContent).toEqual('0');
  fireEvent.click(getByText('Unofficial Full Election Tally Report'));
  const printableArea3 = getByTestId('printable-area');
  expect(within(printableArea3).getAllByText('0').length).toBe(40);
});

test('tabulating CVRs with SEMS file', async () => {
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
  const { getByText, getByTestId, getAllByText } = render(
    <App storage={storage} card={card} hardware={hardware} />
  );
  jest.advanceTimersByTime(2000);
  await authenticateWithElectionManagerCard(
    card,
    eitherNeitherElectionDefinition
  );

  fireEvent.click(getByText('Tally'));
  getByText('External Results (sems-results.csv)');

  fireEvent.click(getByText('Reports'));
  getByText('External Results (sems-results.csv)');
  expect(getByTestId('total-ballot-count').textContent).toEqual('200');

  fireEvent.click(getByText('Unofficial Full Election Tally Report'));

  // Report title should be rendered 3 times - app, preview, and printed
  expect(
    getAllByText('Unofficial Mock General Election Choctaw 2020 Tally Report')
      .length
  ).toBe(3);
  const printableArea1 = getByTestId('printable-area');
  const absenteeRow = within(printableArea1).getByTestId('absentee');
  domGetByText(absenteeRow, 'Absentee');
  domGetByText(absenteeRow, '50');

  const precinctRow = within(printableArea1).getByTestId('standard');
  domGetByText(precinctRow, 'Precinct');
  domGetByText(precinctRow, '150');

  const totalRow = within(printableArea1).getByTestId('total');
  domGetByText(totalRow, 'Total Ballots Cast');
  domGetByText(totalRow, '200');

  // TODO: Snapshots without clear definition of what they are for cause future developers to have to figure out what the test is for each time this test breaks.
  const printableArea2 = getByTestId('printable-area');
  expect(
    within(printableArea2).getByTestId('election-full-tally-report')
  ).toMatchSnapshot();
  fireEvent.click(getByText('Back to Reports'));

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
  fireEvent.click(getByText('Tally'));
  fireEvent.click(getByText('Remove External Results File'));
  fireEvent.click(getByText('Remove External Files'));
  await waitFor(() =>
    expect(getByTestId('total-cvr-count').textContent).toEqual('100')
  );

  fireEvent.click(getByText('Reports'));
  fireEvent.click(getByText('Unofficial Full Election Tally Report'));
});

test('tabulating CVRs with SEMS file and manual data', async () => {
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

  const { getByText, getByTestId, getAllByText, queryAllByText } = render(
    <App storage={storage} card={card} hardware={hardware} />
  );
  await authenticateWithElectionManagerCard(
    card,
    eitherNeitherElectionDefinition
  );

  fireEvent.click(getByText('Tally'));
  expect(getByTestId('total-cvr-count').textContent).toEqual('200');

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
  expect(getByTestId('total-cvr-count').textContent).toEqual('300');

  const fileTable = getByTestId('loaded-file-table');
  const manualRow = domGetByText(
    fileTable,
    'External Results (Manually Added Data)'
  ).closest('tr')!;
  domGetByText(manualRow, '100');
  domGetByText(manualRow, 'District 5');

  fireEvent.click(getByText('Reports'));
  getByText('External Results (Manually Added Data)');
  expect(getByTestId('total-ballot-count').textContent).toEqual('300');

  fireEvent.click(getByText('Unofficial Full Election Tally Report'));
  // Report title should be rendered 3 times - app, preview, and printed
  expect(
    getAllByText('Unofficial Mock General Election Choctaw 2020 Tally Report')
      .length
  ).toBe(3);
  const printableArea1 = getByTestId('printable-area');
  const absenteeRow1 = within(printableArea1).getByTestId('absentee');
  domGetByText(absenteeRow1, 'Absentee');
  domGetByText(absenteeRow1, '50');

  const precinctRow1 = within(printableArea1).getByTestId('standard');
  domGetByText(precinctRow1, 'Precinct');
  domGetByText(precinctRow1, '250');

  const totalRow1 = within(printableArea1).getByTestId('total');
  domGetByText(totalRow1, 'Total Ballots Cast');
  domGetByText(totalRow1, '300');

  // Now edit the manual data
  fireEvent.click(getByText('Tally'));
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
  expect(getByTestId('total-cvr-count').textContent).toEqual('400');
  const fileTable2 = getByTestId('loaded-file-table');
  const manualRow2 = domGetByText(
    fileTable2,
    'External Results (Manually Added Data)'
  ).closest('tr')!;
  domGetByText(manualRow2, '200');
  domGetByText(manualRow2, 'District 5, Panhandle');

  fireEvent.click(getByText('Reports'));
  expect(getByTestId('total-ballot-count').textContent).toEqual('400');
  getByText('External Results (Manually Added Data)');

  fireEvent.click(getByText('Unofficial Full Election Tally Report'));
  // Report title should be rendered 3 times - app, preview, and printed
  expect(
    getAllByText('Unofficial Mock General Election Choctaw 2020 Tally Report')
      .length
  ).toBe(3);
  const printableArea2 = getByTestId('printable-area');
  const absenteeRow2 = within(printableArea2).getByTestId('absentee');
  domGetByText(absenteeRow2, 'Absentee');
  domGetByText(absenteeRow2, '250');

  const precinctRow2 = within(printableArea2).getByTestId('standard');
  domGetByText(precinctRow2, 'Precinct');
  domGetByText(precinctRow2, '150');

  const totalRow2 = within(printableArea2).getByTestId('total');
  domGetByText(totalRow2, 'Total Ballots Cast');
  domGetByText(totalRow2, '400');

  // Remove the manual data
  fireEvent.click(getByText('Tally'));
  fireEvent.click(getByText('Remove Manual Data'));

  getByText('Do you want to remove the manually entered data?');
  const modal = await screen.findByRole('alertdialog');
  fireEvent.click(within(modal).getByText('Remove Manual Data'));
  await waitFor(() => {
    expect(getByTestId('total-cvr-count').textContent).toEqual('200');
    expect(
      queryAllByText('External Results (Manually Added Data)').length
    ).toBe(0);
  });
});

test('changing election resets sems, cvr, and manual data files', async () => {
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

  await authenticateWithElectionManagerCard(
    card,
    eitherNeitherElectionDefinition
  );

  fireEvent.click(getByText('Reports'));
  await screen.findByText('0 official ballots');
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
  getByText('No CVR files loaded.');
});

test('clearing all files after marking as official clears SEMS, CVR, and manual file', async () => {
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
  const { getByText, getByTestId, queryByText } = render(
    <App
      storage={storage}
      card={card}
      hardware={hardware}
      converter="ms-sems"
    />
  );
  await authenticateWithElectionManagerCard(
    card,
    eitherNeitherElectionDefinition
  );

  fireEvent.click(getByText('Reports'));
  await screen.findByText('0 official ballots');
  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('300')
  );

  fireEvent.click(getByText('Unofficial Full Election Tally Report'));
  fireEvent.click(getByText('Mark Tally Results as Official'));
  const modal = await screen.findByRole('alertdialog');
  fireEvent.click(within(modal).getByText('Mark Tally Results as Official'));

  fireEvent.click(getByText('Reports'));
  getByText('Official Full Election Tally Report');

  fireEvent.click(getByText('Tally'));
  expect(getByText('Import CVR Files').closest('button')).toBeDisabled();
  expect(getByText('Remove CVR Files').closest('button')).toBeDisabled();
  expect(
    getByText('Edit Manually Entered Results').closest('button')
  ).toBeDisabled();
  expect(getByText('Remove Manual Data').closest('button')).toBeDisabled();
  expect(getByTestId('import-sems-button')).toBeDisabled();
  expect(
    getByText('Remove External Results File').closest('button')
  ).toBeDisabled();

  fireEvent.click(getByText('Clear All Tallies and Results'));
  getByText(
    'Do you want to remove the 1 uploaded CVR file, the external results file sems-results.csv, and the manually entered data?'
  );
  fireEvent.click(getByText('Remove All Data'));

  await waitFor(() => {
    expect(getByText('Import CVR Files').closest('button')).toBeEnabled();
  });
  expect(
    getByText('Add Manually Entered Results').closest('button')
  ).toBeEnabled();
  expect(getByTestId('import-sems-button')).toBeEnabled();

  expect(getByText('Remove CVR Files').closest('button')).toBeDisabled();
  expect(getByText('Remove Manual Data').closest('button')).toBeDisabled();
  expect(
    getByText('Remove External Results File').closest('button')
  ).toBeDisabled();

  expect(queryByText('Clear All Tallies and Results')).not.toBeInTheDocument();

  getByText('No CVR files loaded.');
});

test('election manager UI has expected nav when VVSG2 auth flows are enabled', async () => {
  enableVvsg2AuthFlows();

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
  });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await authenticateWithElectionManagerCard(
    card,
    eitherNeitherElectionDefinition
  );

  userEvent.click(screen.getByText('Ballots'));
  await screen.findAllByText('View Ballot');
  userEvent.click(screen.getByText('L&A'));
  await screen.findByRole('heading', { name: 'L&A Testing Documents' });
  userEvent.click(screen.getByText('Tally'));
  await screen.findByRole('heading', {
    name: 'Cast Vote Record (CVR) Management',
  });
  userEvent.click(screen.getByText('Reports'));
  await screen.findByRole('heading', { name: 'Election Reports' });
  screen.getByRole('button', { name: 'Lock Machine' });

  expect(screen.queryByText('Definition')).not.toBeInTheDocument();
  expect(screen.queryByText('Smartcards')).not.toBeInTheDocument();
  expect(screen.queryByText('Advanced')).not.toBeInTheDocument();
});

test('system administrator UI has expected nav when VVSG2 auth flows are enabled', async () => {
  enableVvsg2AuthFlows();

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
  });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await authenticateWithSystemAdministratorCard(card);

  userEvent.click(screen.getByText('Definition'));
  await screen.findByRole('heading', { name: 'Election Definition' });
  userEvent.click(screen.getByText('Draft Ballots'));
  await screen.findAllByText('View Ballot');
  userEvent.click(screen.getByText('Smartcards'));
  await screen.findByRole('heading', { name: 'Election Cards' });
  userEvent.click(screen.getByText('Settings'));
  await screen.findByRole('heading', { name: 'Settings' });
  userEvent.click(screen.getByText('Logs'));
  await screen.findByRole('heading', { name: 'Logs' });
  screen.getByRole('button', { name: 'Lock Machine' });
});

test('system administrator UI has expected nav when no election and VVSG2 auth flows are enabled', async () => {
  enableVvsg2AuthFlows();

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  render(<App card={card} hardware={hardware} storage={storage} />);
  await authenticateWithSystemAdministratorCard(card);

  userEvent.click(screen.getByText('Definition'));
  await screen.findByRole('heading', { name: 'Configure VxAdmin' });
  userEvent.click(screen.getByText('Settings'));
  await screen.findByRole('heading', { name: 'Settings' });
  userEvent.click(screen.getByText('Logs'));
  await screen.findByRole('heading', { name: 'Logs' });
  screen.getByRole('button', { name: 'Lock Machine' });

  expect(screen.queryByText('Draft Ballots')).not.toBeInTheDocument();
  expect(screen.queryByText('Smartcards')).not.toBeInTheDocument();

  // Create an election definition and verify that previously hidden tabs appear
  userEvent.click(screen.getByText('Definition'));
  await screen.findByRole('heading', { name: 'Configure VxAdmin' });
  userEvent.click(
    screen.getByRole('button', { name: 'Create New Election Definition' })
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('heading', { name: 'Configure VxAdmin' })
    ).not.toBeInTheDocument()
  );
  screen.getByText('Draft Ballots');
  screen.getByText('Smartcards');

  // Remove the election definition and verify that those same tabs disappear
  userEvent.click(screen.getByText('Remove Election'));
  const modal = await screen.findByRole('alertdialog');
  userEvent.click(
    within(modal).getByRole('button', { name: 'Remove Election Definition' })
  );
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  expect(screen.queryByText('Draft Ballots')).not.toBeInTheDocument();
  expect(screen.queryByText('Smartcards')).not.toBeInTheDocument();
});

test('system administrator Smartcards screen navigation', async () => {
  enableVvsg2AuthFlows();

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
  });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await authenticateWithSystemAdministratorCard(card);

  userEvent.click(screen.getByText('Smartcards'));
  await screen.findByRole('heading', { name: 'Election Cards' });
  userEvent.click(screen.getByText('Create System Administrator Cards'));
  await screen.findByRole('heading', { name: 'System Administrator Cards' });
  userEvent.click(screen.getByText('Create Election Cards'));
  await screen.findByRole('heading', { name: 'Election Cards' });

  // The smartcard modal and smartcard programming flows are tested in smartcard_modal.test.tsx
});

test('election manager cannot auth onto unconfigured machine when VVSG2 auth flows are enabled', async () => {
  enableVvsg2AuthFlows();

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  render(<App card={card} hardware={hardware} storage={storage} />);

  await screen.findByText('VxAdmin is Locked');
  card.insertCard(
    makeElectionManagerCard(eitherNeitherElectionDefinition.electionHash)
  );
  await screen.findByText('Invalid Card');
  await screen.findByText(
    'This machine is unconfigured and cannot be unlocked with this card. ' +
      'Please insert a System Administrator card.'
  );
});

test('election manager cannot auth onto machine with different election hash when VVSG2 auth flows are enabled', async () => {
  enableVvsg2AuthFlows();

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
  });
  render(<App card={card} hardware={hardware} storage={storage} />);

  await screen.findByText('VxAdmin is Locked');
  card.insertCard(
    makeElectionManagerCard(electionSampleDefinition.electionHash)
  );
  await screen.findByText('Invalid Card');
  await screen.findByText(
    'The inserted Election Manager card is programmed for another election ' +
      'and cannot be used to unlock this machine. ' +
      'Please insert a valid Election Manager or System Administrator card.'
  );
});

test('system administrator Draft Ballots tab and election manager Ballots tab have expected differences', async () => {
  enableVvsg2AuthFlows();

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = await createMemoryStorageWith({
    electionDefinition: eitherNeitherElectionDefinition,
  });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await authenticateWithSystemAdministratorCard(card);

  userEvent.click(screen.getByText('Draft Ballots'));
  await screen.findAllByText('View Ballot');
  expect(screen.queryByText('Save PDFs')).not.toBeInTheDocument();
  expect(screen.queryByText('Export Package')).not.toBeInTheDocument();

  userEvent.click(screen.getAllByText('View Ballot')[0]);
  await screen.findByRole('heading', {
    name: 'Ballot Style 4 for Bywy has 8 contests',
  });
  screen.getByRole('button', { name: 'Absentee' });
  screen.getByRole('button', { name: 'Precinct' });
  expect(
    screen.queryByRole('button', { name: 'Official' })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Test' })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Sample' })
  ).not.toBeInTheDocument();
  screen.getByRole('button', { name: 'Print 1 Draft Absentee Ballot' });
  expect(screen.queryByText(/Ballot Package Filename/)).not.toBeInTheDocument();

  userEvent.click(screen.getByText('Lock Machine'));
  await authenticateWithElectionManagerCard(
    card,
    eitherNeitherElectionDefinition
  );

  userEvent.click(screen.getByText('Ballots'));
  await screen.findAllByText('View Ballot');
  screen.getByText('Save PDFs');
  screen.getByText('Export Package');

  userEvent.click(screen.getAllByText('View Ballot')[0]);
  await screen.findByRole('heading', {
    name: 'Ballot Style 4 for Bywy has 8 contests',
  });
  screen.getByRole('button', { name: 'Absentee' });
  screen.getByRole('button', { name: 'Precinct' });
  screen.getByRole('button', { name: 'Official' });
  screen.getByRole('button', { name: 'Test' });
  screen.getByRole('button', { name: 'Sample' });
  screen.getByRole('button', { name: 'Print 1 Official Absentee Ballot' });
  screen.getByText(/Ballot Package Filename/);
});
