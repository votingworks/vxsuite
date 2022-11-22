import React from 'react';
import MockDate from 'mockdate';
import {
  fireEvent,
  screen,
  waitFor,
  getByTestId as domGetByTestId,
  getByText as domGetByText,
  getAllByRole as domGetAllByRole,
  act,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fetchMock from 'fetch-mock';
import {
  electionWithMsEitherNeitherFixtures,
  electionSampleDefinition,
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireHudsonFixtures,
} from '@votingworks/fixtures';
import { MemoryCard, MemoryHardware, typedAs } from '@votingworks/utils';
import {
  advanceTimersAndPromises,
  expectPrint,
  expectPrintToMatchSnapshot,
  fakeKiosk,
  fakePrinter,
  fakePrinterInfo,
  fakeUsbDrive,
  makeElectionManagerCard,
} from '@votingworks/test-utils';
import {
  ElectionManagerCardData,
  ExternalTallySourceType,
  PollWorkerCardData,
  VotingMethod,
} from '@votingworks/types';
import { fakeLogger, LogEventId } from '@votingworks/logging';

import { App } from './app';
import {
  eitherNeitherElectionDefinition,
  renderRootElement,
} from '../test/render_in_app_context';
import { convertSemsFileToExternalTally } from './utils/sems_tallies';
import { convertTalliesByPrecinctToFullExternalTally } from './utils/external_tallies';
import { MachineConfig } from './config/types';
import { VxFiles } from './lib/converters';
import {
  authenticateWithElectionManagerCard,
  authenticateWithSystemAdministratorCard,
} from '../test/util/authenticate';
import { ElectionManagerStoreMemoryBackend } from './lib/backends';
import { CastVoteRecordFiles } from './utils/cast_vote_record_files';

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
  fetchMock.delete('/admin/write-ins/cvrs', { body: { status: 'ok ' } });
});

afterEach(() => {
  delete window.kiosk;
  MockDate.reset();
});

test('create election works', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const backend = new ElectionManagerStoreMemoryBackend();
  const logger = fakeLogger();
  const { getByText, queryAllByText, getByTestId } = renderRootElement(
    <App card={card} hardware={hardware} />,
    { backend, logger }
  );
  await authenticateWithSystemAdministratorCard(card);
  await screen.findByText('Load Demo Election Definition');
  fireEvent.click(getByText('Load Demo Election Definition'));

  await screen.findByText('Election Definition');

  await screen.findByText('Ballots');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ElectionConfigured,
    'system_administrator',
    expect.anything()
  );

  fireEvent.click(await screen.findByText('Ballots'));
  await waitFor(() => {
    fireEvent.click(screen.getAllByText('View Ballot')[0]);
  });

  // You can view the Logs screen and save log files when there is an election.
  fireEvent.click(screen.getByText('Logs'));
  fireEvent.click(screen.getByText('Save Log File'));
  await screen.findByText('No Log File Present');
  fireEvent.click(screen.getByText('Close'));
  fireEvent.click(screen.getByText('Save Log File as CDF'));
  await screen.findByText('No Log File Present');

  fireEvent.click(getByText('Definition'));

  // Verify editing an election is disabled
  fireEvent.click(getByText('View Definition JSON'));
  expect(queryAllByText('Reset').length).toBe(0);
  expect(getByTestId('json-input').hasAttribute('disabled')).toBe(true);

  // remove the election
  fireEvent.click(getByText('Remove'));
  fireEvent.click(getByText('Remove Election Definition'));

  await screen.findByText('Configure VxAdmin');
  expect(logger.log).toHaveBeenCalledWith(
    expect.stringContaining(LogEventId.ElectionUnconfigured),
    'system_administrator',
    expect.anything()
  );

  // You can view the Logs screen and save log files when there is no election.
  fireEvent.click(screen.getByText('Logs'));
  fireEvent.click(screen.getByText('Save Log File'));
  await screen.findByText('No Log File Present');
  fireEvent.click(screen.getByText('Close'));
  fireEvent.click(screen.getByText('Save Log File as CDF'));
  // You can not save as CDF when there is no election.
  expect(screen.queryAllByText('No Log File Present')).toHaveLength(0);

  fireEvent.click(screen.getByText('Definition'));
  await screen.findByText('Load Demo Election Definition');
});

test('authentication works', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition: eitherNeitherElectionDefinition,
  });
  const logger = fakeLogger();

  renderRootElement(<App card={card} hardware={hardware} />, {
    backend,
    logger,
  });

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
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.AuthPasscodeEntry,
    expect.any(String),
    expect.objectContaining({
      disposition: 'failure',
    })
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

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.AuthPasscodeEntry,
    expect.any(String),
    expect.objectContaining({
      disposition: 'success',
    })
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.AuthLogin,
    'election_manager',
    expect.objectContaining({
      disposition: 'success',
    })
  );

  // Machine is unlocked when card removed
  card.removeCard();
  await advanceTimersAndPromises(1);
  await screen.findByText('Ballots');

  // The card and other cards can be inserted with no impact.
  card.insertCard(electionManagerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Ballots');
  card.removeCard();
  await advanceTimersAndPromises(1);
  await screen.findByText('Ballots');
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Ballots');
  card.removeCard();
  await advanceTimersAndPromises(1);

  // Lock the machine
  fireEvent.click(screen.getByText('Lock Machine'));
  await screen.findByText('VxAdmin is Locked');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.AuthLogout,
    expect.any(String),
    expect.anything()
  );
});

test('L&A (logic and accuracy) flow', async () => {
  // TODO: Move common setup logic to a beforeEach block
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const printer = fakePrinter();
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition: eitherNeitherElectionDefinition,
  });
  const logger = fakeLogger();
  renderRootElement(<App card={card} hardware={hardware} printer={printer} />, {
    backend,
    logger,
  });
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
  await expectPrintToMatchSnapshot();
  await waitFor(() =>
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.TestDeckTallyReportPrinted,
      expect.any(String),
      expect.anything()
    )
  );
  jest.advanceTimersByTime(5000);

  // L&A package: BMD test deck
  await screen.findByText('Printing L&A Package for District 5', {
    exact: false,
  });
  await expectPrintToMatchSnapshot();
  await waitFor(() =>
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.TestDeckPrinted,
      expect.any(String),
      expect.anything()
    )
  );
  expect(logger.log).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(String),
    expect.objectContaining({
      message: expect.stringContaining('BMD paper ballot test deck'),
    })
  );
  jest.advanceTimersByTime(30000);

  // L&A package: HMPB test deck
  await screen.findByText('Printing L&A Package for District 5', {
    exact: false,
  });
  await expectPrintToMatchSnapshot();
  await waitFor(() =>
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.TestDeckPrinted,
      expect.any(String),
      expect.anything()
    )
  );
  expect(logger.log).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(String),
    expect.objectContaining({
      message: expect.stringContaining('Hand-marked paper ballot test deck'),
    })
  );

  // Test printing full test deck tally
  userEvent.click(screen.getByText('L&A'));
  userEvent.click(screen.getByText('Print Full Test Deck Tally Report'));

  await screen.findByText('Printing');
  const expectedTallies: { [tally: string]: number } = {
    '104': 10,
    '52': 12,
    '24': 6,
    '12': 4,
    '8': 3,
    '4': 2,
  };
  await expectPrint((printedElement, printOptions) => {
    printedElement.getByText(
      'Test Deck Mock General Election Choctaw 2020 Tally Report'
    );
    for (const [tally, times] of Object.entries(expectedTallies)) {
      expect(printedElement.getAllByText(tally).length).toEqual(times);
    }
    expect(printOptions).toMatchObject({ sides: 'one-sided' });
  });
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.TestDeckTallyReportPrinted,
    expect.any(String),
    expect.anything()
  );
});

test('L&A features are available after test results are loaded', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition: eitherNeitherElectionDefinition,
    castVoteRecordFiles: await CastVoteRecordFiles.empty.add(
      EITHER_NEITHER_CVR_TEST_FILE,
      eitherNeitherElectionDefinition.election
    ),
  });
  renderRootElement(<App card={card} hardware={hardware} />, { backend });

  await authenticateWithElectionManagerCard(
    card,
    eitherNeitherElectionDefinition
  );

  // Confirm that test results are loaded
  userEvent.click(screen.getByText('Tally'));
  await screen.findByText('Currently tallying test ballots.', { exact: false });
  expect(screen.getByTestId('total-cvr-count').textContent).toEqual('100');

  // Confirm that L&A materials are available
  userEvent.click(screen.getByText('L&A'));
  screen.getByText('List Precinct L&A Packages');
  screen.getByText('Print Full Test Deck Tally Report');
});

test('printing ballots and printed ballots report', async () => {
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition: eitherNeitherElectionDefinition,
  });

  const printer = fakePrinter();
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  hardware.setPrinterConnected(false);
  const logger = fakeLogger();
  const { getByText, getAllByText, queryAllByText, getAllByTestId } =
    renderRootElement(
      <App printer={printer} card={card} hardware={hardware} />,
      { backend, logger }
    );
  jest.advanceTimersByTime(2000); // Cause the usb drive to be detected
  await authenticateWithElectionManagerCard(
    card,
    eitherNeitherElectionDefinition
  );

  fireEvent.click(getByText('Reports'));
  await screen.findAllByText('0 ballots');
  expect(screen.getByTestId('printed-ballots-summary')).toHaveTextContent(
    '0 ballots have been printed.'
  );

  fireEvent.click(getByText('Ballots'));
  fireEvent.click(getAllByText('View Ballot')[0]);
  fireEvent.click(getByText('Precinct'));
  fireEvent.click(getByText('Absentee'));
  fireEvent.click(getByText('Test'));
  fireEvent.click(getByText('Official'));
  fireEvent.click(getByText('Print 1', { exact: false }));

  // PrintButton flow where printer is not connected
  await screen.findByText('The printer is not connected.');
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  act(() => {
    hardware.setPrinterConnected(true);
  });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled();
  });
  userEvent.click(screen.getByRole('button', { name: 'Continue' }));

  // Printing should now continue normally
  await waitFor(() => getByText('Printing'));
  await expectPrint((printedElement, printOptions) => {
    printedElement.getByText('Mocked HMPB');
    printedElement.getByText('Ballot Mode: live');
    printedElement.getByText('Absentee: true');
    expect(printOptions).toMatchObject({
      sides: 'two-sided-long-edge',
      copies: 1,
    });
  });
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.BallotPrinted,
    expect.any(String),
    expect.anything()
  );
  fireEvent.click(getByText('Print 1', { exact: false }));
  await waitFor(() => getByText('Printing'));
  await expectPrint();
  fireEvent.click(getByText('Precinct'));
  fireEvent.click(getByText('Print 1', { exact: false }));
  await waitFor(() => getByText('Printing'));
  await expectPrint();
  await waitFor(() => !getByText('Printing'));

  fireEvent.click(getByText('Reports'));
  await screen.findByText('3 ballots', { exact: false });
  expect(screen.getByTestId('printed-ballots-summary')).toHaveTextContent(
    '3 ballots have been printed.'
  );
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
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.PrintedBallotReportPrinted,
    expect.any(String),
    expect.anything()
  );
});

test('tabulating CVRs', async () => {
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition: eitherNeitherElectionDefinition,
    castVoteRecordFiles: await CastVoteRecordFiles.empty.add(
      EITHER_NEITHER_CVR_FILE,
      eitherNeitherElectionDefinition.election
    ),
  });

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const printer = fakePrinter();
  const logger = fakeLogger();
  const { getByText, getAllByText, getByTestId, queryByText } =
    renderRootElement(
      <App card={card} hardware={hardware} printer={printer} />,
      { backend, logger }
    );
  jest.advanceTimersByTime(2000); // Cause the usb drive to be detected
  await authenticateWithElectionManagerCard(
    card,
    eitherNeitherElectionDefinition
  );

  fireEvent.click(getByText('Reports'));
  expect(getByTestId('total-ballot-count').textContent).toEqual('100');

  fireEvent.click(getByText('Unofficial Full Election Tally Report'));
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.TallyReportPreviewed,
    expect.any(String),
    expect.anything()
  );

  fireEvent.click(getByText('Mark Tally Results as Official'));
  getByText('Mark Unofficial Tally Results as Official Tally Results?');
  const modal = await screen.findByRole('alertdialog');
  fireEvent.click(within(modal).getByText('Mark Tally Results as Official'));

  // Report title should be rendered 3 times - app, preview, and printed
  await waitFor(() => {
    expect(
      getAllByText('Official Mock General Election Choctaw 2020 Tally Report')
        .length
    ).toBe(3);
  });

  // TODO: Snapshots without clear definition of what they are for cause future developers to have to figure out what the test is for each time this test breaks.
  const printableArea1 = getByTestId('printable-area');
  expect(
    within(printableArea1).getByTestId('election-full-tally-report')
  ).toMatchSnapshot();

  fireEvent.click(getByText('Reports'));

  fireEvent.click(getByText('Show Results by Batch and Scanner'));
  getByText('Batch Name');
  fireEvent.click(getByText('Save Batch Results as CSV'));
  jest.advanceTimersByTime(2000);
  getByText('Save Batch Results');
  await screen.findByText(
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
        'Batch ID,Batch Name,Tabulator,Number of Ballots,"President - Ballots Cast"'
      )
    );
  });
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    expect.any(String),
    expect.anything()
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
  await waitFor(() => getByText('Save SEMS Results'));
  fireEvent.click(getByText('Save SEMS Results'));
  jest.advanceTimersByTime(2000);
  getByText(
    'votingworks-sems-live-results_choctaw-county_mock-general-election-choctaw-2020_2020-11-03_22-22-00.txt'
  );

  fireEvent.click(getByText('Save'));
  await waitFor(() => getByText(/Saving/));
  jest.advanceTimersByTime(2000);
  await waitFor(() => getByText(/Results Saved/));
  await waitFor(() => {
    expect(mockKiosk.writeFile).toHaveBeenCalledTimes(2);
    expect(mockKiosk.writeFile).toHaveBeenNthCalledWith(
      2,
      'fake mount point/votingworks-sems-live-results_choctaw-county_mock-general-election-choctaw-2020_2020-11-03_22-22-00.txt',
      'test-content'
    );
  });
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ConvertingResultsToSemsFormat,
    expect.any(String)
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
    'L&A testing documents are not available after official election CVRs have been loaded.',
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
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.RemovedTallyFile,
    expect.any(String),
    expect.anything()
  );

  fireEvent.click(getByText('Reports'));
  await waitFor(() => {
    expect(getByTestId('total-ballot-count').textContent).toEqual('0');
  });
  fireEvent.click(
    await screen.findByText('Unofficial Full Election Tally Report')
  );
  const printableArea3 = getByTestId('printable-area');
  expect(within(printableArea3).getAllByText('0').length).toBe(40);
});

test('tabulating CVRs with SEMS file', async () => {
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition: eitherNeitherElectionDefinition,
  });

  await backend.addCastVoteRecordFile(EITHER_NEITHER_CVR_FILE);

  const semsFileTally = convertSemsFileToExternalTally(
    EITHER_NEITHER_SEMS_DATA,
    eitherNeitherElectionDefinition.election,
    VotingMethod.Precinct,
    'sems-results.csv',
    new Date()
  );
  await backend.updateFullElectionExternalTally(
    semsFileTally.source,
    semsFileTally
  );

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const { getByText, getByTestId, getAllByText } = renderRootElement(
    <App card={card} hardware={hardware} />,
    { backend }
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

  // Test saving the final results
  fetchMock.post('/convert/tallies/submitfile', { body: { status: 'ok' } });
  fetchMock.post('/convert/tallies/process', { body: { status: 'ok' } });

  fetchMock.getOnce('/convert/tallies/output?name=name', {
    body: 'test-content',
  });

  fetchMock.post('/convert/reset', { body: { status: 'ok' } });
  await waitFor(() => getByText('Save SEMS Results'));
  fireEvent.click(getByText('Save SEMS Results'));
  jest.advanceTimersByTime(2000);
  getByText(
    'votingworks-sems-live-results_choctaw-county_mock-general-election-choctaw-2020_2020-11-03_22-22-00.txt'
  );

  fireEvent.click(getByText('Save'));
  await waitFor(() => getByText(/Saving/));
  jest.advanceTimersByTime(2000);
  await waitFor(() => getByText(/Results Saved/));
  await waitFor(() => {
    expect(mockKiosk.writeFile).toHaveBeenCalledTimes(1);
    expect(mockKiosk.writeFile).toHaveBeenNthCalledWith(
      1,
      'fake mount point/votingworks-sems-live-results_choctaw-county_mock-general-election-choctaw-2020_2020-11-03_22-22-00.txt',
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
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition: eitherNeitherElectionDefinition,
  });
  await backend.addCastVoteRecordFile(EITHER_NEITHER_CVR_FILE);

  const semsFileTally = convertSemsFileToExternalTally(
    EITHER_NEITHER_SEMS_DATA,
    eitherNeitherElectionDefinition.election,
    VotingMethod.Precinct,
    'sems-results.csv',
    new Date()
  );
  await backend.updateFullElectionExternalTally(
    semsFileTally.source,
    semsFileTally
  );

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();

  const { getByText, getByTestId, getAllByText, queryAllByText } =
    renderRootElement(<App card={card} hardware={hardware} />, { backend });
  await authenticateWithElectionManagerCard(
    card,
    eitherNeitherElectionDefinition
  );

  fireEvent.click(getByText('Tally'));
  expect(getByTestId('total-cvr-count').textContent).toEqual('200');

  fireEvent.click(getByText('Add Manually Entered Results'));
  getByText('Manually Entered Precinct Results');
  fireEvent.click(getByText('Edit Precinct Results for District 5'));
  await screen.findByText('Save Precinct Results for District 5');
  fireEvent.change(getByTestId('775020876-undervotes-input'), {
    target: { value: '12' },
  });
  fireEvent.change(getByTestId('775020876-overvotes-input'), {
    target: { value: '8' },
  });
  fireEvent.change(getByTestId('775020876-775031988-input'), {
    target: { value: '32' },
  });
  fireEvent.change(getByTestId('775020876-775031987-input'), {
    target: { value: '28' },
  });
  fireEvent.change(getByTestId('775020876-775031989-input'), {
    target: { value: '20' },
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
  await screen.findByText('Save Absentee Results for Panhandle');
  fireEvent.change(getByTestId('750000017-undervotes-input'), {
    target: { value: '17' },
  });
  fireEvent.change(getByTestId('750000017-overvotes-input'), {
    target: { value: '3' },
  });
  fireEvent.change(getByTestId('750000017-yes-input'), {
    target: { value: '54' },
  });
  fireEvent.change(getByTestId('750000017-no-input'), {
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
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition: eitherNeitherElectionDefinition,
  });
  await backend.addCastVoteRecordFile(EITHER_NEITHER_CVR_FILE);

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
  await backend.updateFullElectionExternalTally(
    semsFileTally.source,
    semsFileTally
  );
  await backend.updateFullElectionExternalTally(
    manualTally.source,
    manualTally
  );

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();

  const { getByText, getByTestId } = renderRootElement(
    <App card={card} hardware={hardware} />,
    { backend }
  );

  await authenticateWithElectionManagerCard(
    card,
    eitherNeitherElectionDefinition
  );

  fireEvent.click(getByText('Reports'));
  await screen.findByText('0 ballots');
  expect(screen.getByTestId('printed-ballots-summary')).toHaveTextContent(
    '0 ballots have been printed.'
  );
  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('300')
  );

  userEvent.click(screen.getByText('Lock Machine'));
  await authenticateWithSystemAdministratorCard(card);

  fireEvent.click(getByText('Definition'));
  fireEvent.click(getByText('Remove Election'));
  fireEvent.click(getByText('Remove Election Definition'));
  await waitFor(() => {
    fireEvent.click(getByText('Load Demo Election Definition'));
  });

  userEvent.click(screen.getByText('Lock Machine'));
  await authenticateWithElectionManagerCard(
    card,
    electionFamousNames2021Fixtures.electionDefinition
  );

  fireEvent.click(await screen.findByText('Tally'));
  getByText('No CVR files loaded.');
});

test('clearing all files after marking as official clears SEMS, CVR, and manual file', async () => {
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition: eitherNeitherElectionDefinition,
  });
  await backend.addCastVoteRecordFile(EITHER_NEITHER_CVR_FILE);

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
  await backend.updateFullElectionExternalTally(
    semsFileTally.source,
    semsFileTally
  );
  await backend.updateFullElectionExternalTally(
    manualTally.source,
    manualTally
  );

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const { getByText, getByTestId, queryByText } = renderRootElement(
    <App card={card} hardware={hardware} converter="ms-sems" />,
    { backend }
  );
  await authenticateWithElectionManagerCard(
    card,
    eitherNeitherElectionDefinition
  );

  fireEvent.click(getByText('Reports'));
  await screen.findByText('0 ballots');
  expect(screen.getByTestId('printed-ballots-summary')).toHaveTextContent(
    '0 ballots have been printed.'
  );
  await waitFor(() =>
    expect(getByTestId('total-ballot-count').textContent).toEqual('300')
  );

  fireEvent.click(getByText('Unofficial Full Election Tally Report'));
  fireEvent.click(getByText('Mark Tally Results as Official'));
  const modal = await screen.findByRole('alertdialog');
  fireEvent.click(within(modal).getByText('Mark Tally Results as Official'));

  fireEvent.click(getByText('Reports'));
  await waitFor(() => {
    getByText('Official Full Election Tally Report');
  });

  fireEvent.click(getByText('Tally'));
  expect(getByText('Load CVR Files').closest('button')).toBeDisabled();
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
    'Do you want to remove the 1 loaded CVR file, the external results file sems-results.csv, and the manually entered data?'
  );
  fireEvent.click(getByText('Remove All Data'));

  await waitFor(() => {
    expect(getByText('Load CVR Files').closest('button')).toBeEnabled();
  });
  await waitFor(() => {
    expect(
      getByText('Add Manually Entered Results').closest('button')
    ).toBeEnabled();
  });
  expect(getByTestId('import-sems-button')).toBeEnabled();

  expect(getByText('Remove CVR Files').closest('button')).toBeDisabled();
  expect(getByText('Remove Manual Data').closest('button')).toBeDisabled();
  expect(
    getByText('Remove External Results File').closest('button')
  ).toBeDisabled();

  expect(queryByText('Clear All Tallies and Results')).not.toBeInTheDocument();

  getByText('No CVR files loaded.');
});

test('Can not view or print ballots when using an election with gridlayouts (like NH)', async () => {
  const { electionDefinition } = electionGridLayoutNewHampshireHudsonFixtures;

  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition,
  });

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const { getByText, queryByText } = renderRootElement(
    <App card={card} hardware={hardware} />,
    { backend }
  );

  await authenticateWithSystemAdministratorCard(card);
  fireEvent.click(getByText('Ballots'));
  await screen.findByText(
    'VxAdmin does not produce ballots for this election.'
  );
  expect(queryByText('Save Ballot Package')).toBeNull();
  fireEvent.click(getByText('Lock Machine'));

  await authenticateWithElectionManagerCard(card, electionDefinition);
  await screen.findByText(
    'VxAdmin does not produce ballots for this election.'
  );
  getByText('Save Ballot Package');
});

test('election manager UI has expected nav', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition: eitherNeitherElectionDefinition,
  });
  renderRootElement(<App card={card} hardware={hardware} />, { backend });
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

test('system administrator UI has expected nav', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition: eitherNeitherElectionDefinition,
  });
  renderRootElement(<App card={card} hardware={hardware} />, { backend });
  await authenticateWithSystemAdministratorCard(card);

  userEvent.click(screen.getByText('Definition'));
  await screen.findByRole('heading', { name: 'Election Definition' });
  userEvent.click(screen.getByText('Ballots'));
  await screen.findAllByText('View Ballot');
  userEvent.click(screen.getByText('Smartcards'));
  await screen.findByRole('heading', { name: 'Election Cards' });
  userEvent.click(screen.getByText('Settings'));
  await screen.findByRole('heading', { name: 'Settings' });
  userEvent.click(screen.getByText('Logs'));
  await screen.findByRole('heading', { name: 'Logs' });
  screen.getByRole('button', { name: 'Lock Machine' });
});

test('system administrator UI has expected nav when no election', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const backend = new ElectionManagerStoreMemoryBackend();
  renderRootElement(<App card={card} hardware={hardware} />, { backend });
  await authenticateWithSystemAdministratorCard(card);

  userEvent.click(screen.getByText('Definition'));
  await screen.findByRole('heading', { name: 'Configure VxAdmin' });
  userEvent.click(screen.getByText('Settings'));
  await screen.findByRole('heading', { name: 'Settings' });
  userEvent.click(screen.getByText('Logs'));
  await screen.findByRole('heading', { name: 'Logs' });
  screen.getByRole('button', { name: 'Lock Machine' });

  expect(screen.queryByText('Ballots')).not.toBeInTheDocument();
  expect(screen.queryByText('Smartcards')).not.toBeInTheDocument();

  // Create an election definition and verify that previously hidden tabs appear
  userEvent.click(screen.getByText('Definition'));
  await screen.findByRole('heading', { name: 'Configure VxAdmin' });
  userEvent.click(
    screen.getByRole('button', { name: 'Load Demo Election Definition' })
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('heading', { name: 'Configure VxAdmin' })
    ).not.toBeInTheDocument()
  );
  screen.getByText('Ballots');
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
  await waitFor(() =>
    expect(screen.queryByText('Ballots')).not.toBeInTheDocument()
  );
  expect(screen.queryByText('Smartcards')).not.toBeInTheDocument();
});

test('system administrator Smartcards screen navigation', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition: eitherNeitherElectionDefinition,
  });
  renderRootElement(<App card={card} hardware={hardware} />, { backend });
  await authenticateWithSystemAdministratorCard(card);

  userEvent.click(screen.getByText('Smartcards'));
  await screen.findByRole('heading', { name: 'Election Cards' });
  userEvent.click(screen.getByText('Create System Administrator Cards'));
  await screen.findByRole('heading', { name: 'System Administrator Cards' });
  userEvent.click(screen.getByText('Create Election Cards'));
  await screen.findByRole('heading', { name: 'Election Cards' });

  // The smartcard modal and smartcard programming flows are tested in smartcard_modal.test.tsx
});

test('election manager cannot auth onto unconfigured machine', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const backend = new ElectionManagerStoreMemoryBackend();
  renderRootElement(<App card={card} hardware={hardware} />, { backend });

  await screen.findByText('VxAdmin is Locked');
  screen.getByText('Insert System Administrator card to unlock.');
  card.insertCard(
    makeElectionManagerCard(eitherNeitherElectionDefinition.electionHash)
  );
  await screen.findByText('Invalid Card');
  await screen.findByText(
    'This machine is unconfigured and cannot be unlocked with this card. ' +
      'Please insert a System Administrator card.'
  );
});

test('election manager cannot auth onto machine with different election hash', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition: eitherNeitherElectionDefinition,
  });
  renderRootElement(<App card={card} hardware={hardware} />, { backend });

  await screen.findByText('VxAdmin is Locked');
  await screen.findByText(
    'Insert System Administrator or Election Manager card to unlock.'
  );
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

test('system administrator Ballots tab and election manager Ballots tab have expected differences', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition: eitherNeitherElectionDefinition,
  });
  renderRootElement(<App card={card} hardware={hardware} />, { backend });

  await authenticateWithSystemAdministratorCard(card);

  const numPrecinctBallots = 13;

  userEvent.click(screen.getByText('Ballots'));
  let viewBallotButtons = await screen.findAllByText('View Ballot');
  expect(viewBallotButtons).toHaveLength(
    numPrecinctBallots + 1 // Super ballot
  );
  screen.getByText('Print All');
  expect(screen.queryByText('Save PDFs')).not.toBeInTheDocument();
  expect(screen.queryByText('Save Ballot Package')).not.toBeInTheDocument();

  // View super ballot
  userEvent.click(viewBallotButtons[0]);
  await screen.findByRole('heading', {
    name: 'Ballot Style All has 13 contests',
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
  screen.getByRole('button', { name: 'Print 1 Sample Absentee Ballot' });
  expect(screen.queryByText(/Ballot Package Filename/)).not.toBeInTheDocument();

  // View precinct ballot
  userEvent.click(screen.getByText('Back to List Ballots'));
  viewBallotButtons = await screen.findAllByText('View Ballot');
  userEvent.click(viewBallotButtons[1]);
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
  screen.getByRole('button', { name: 'Print 1 Sample Absentee Ballot' });
  screen.getByRole('button', { name: 'Save Ballot as PDF' });
  expect(screen.queryByText(/Ballot Package Filename/)).not.toBeInTheDocument();

  userEvent.click(screen.getByText('Lock Machine'));
  await authenticateWithElectionManagerCard(
    card,
    eitherNeitherElectionDefinition
  );

  userEvent.click(screen.getByText('Ballots'));
  viewBallotButtons = await screen.findAllByText('View Ballot');
  expect(viewBallotButtons).toHaveLength(numPrecinctBallots);
  screen.getByText('Print All');
  screen.getByText('Save PDFs');
  screen.getByText('Save Ballot Package');

  userEvent.click(viewBallotButtons[0]);
  await screen.findByRole('heading', {
    name: 'Ballot Style 4 for Bywy has 8 contests',
  });
  screen.getByRole('button', { name: 'Absentee' });
  screen.getByRole('button', { name: 'Precinct' });
  screen.getByRole('button', { name: 'Official' });
  screen.getByRole('button', { name: 'Test' });
  screen.getByRole('button', { name: 'Sample' });
  screen.getByRole('button', { name: 'Print 1 Official Absentee Ballot' });
  screen.getByRole('button', { name: 'Save Ballot as PDF' });
  screen.getByText(/Ballot Package Filename/);
});
