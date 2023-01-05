import React from 'react';
import fetchMock from 'fetch-mock';
import { Scan } from '@votingworks/api';
import {
  ALL_PRECINCTS_SELECTION,
  ReportSourceMachineType,
  singlePrecinctSelectionFor,
  MemoryCard,
  MemoryHardware,
  MemoryStorage,
} from '@votingworks/utils';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import { waitFor, screen, within, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  fakeKiosk,
  fakeUsbDrive,
  advanceTimersAndPromises,
  makePollWorkerCard,
  makeElectionManagerCard,
  makeSystemAdministratorCard,
  expectPrint,
  generateCvr,
} from '@votingworks/test-utils';
import {
  electionSampleDefinition,
  electionSample2Definition,
  electionSample,
} from '@votingworks/fixtures';
import { AdjudicationReason, err, ok } from '@votingworks/types';

import {
  BALLOT_BAG_CAPACITY,
  POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
} from './config/globals';
import { MachineConfigResponse } from './config/types';
import {
  authenticateElectionManagerCard,
  scannerStatus,
} from '../test/helpers/helpers';
import { REPRINT_REPORT_TIMEOUT_SECONDS } from './screens/poll_worker_screen';
import { SELECT_PRECINCT_TEXT } from './screens/election_manager_screen';
import { fakeFileWriter } from '../test/helpers/fake_file_writer';
import { createApiMock, statusNoPaper } from '../test/helpers/mock_api_client';
import { App, AppProps } from './app';

const apiMock = createApiMock();

jest.setTimeout(20000);

fetchMock.config.overwriteRoutes = false;

const machineId = '0002';
const getMachineConfigBody: MachineConfigResponse = {
  machineId,
  codeVersion: '3.14',
};

let kiosk = fakeKiosk();

const pollWorkerCard = makePollWorkerCard(
  electionSampleDefinition.electionHash
);

const electionManagerCard = makeElectionManagerCard(
  electionSampleDefinition.electionHash,
  '123456'
);

function renderApp(props: Partial<AppProps> = {}) {
  const card = new MemoryCard();
  const hardware = MemoryHardware.build({
    connectPrinter: false,
    connectCardReader: true,
    connectPrecinctScanner: true,
  });
  const logger = fakeLogger();
  const storage = new MemoryStorage();
  render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      logger={logger}
      apiClient={apiMock.mockApiClient}
      {...props}
    />
  );
  return { card, hardware, logger, storage };
}

beforeEach(() => {
  jest.useFakeTimers();

  kiosk = fakeKiosk();
  kiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
  kiosk.writeFile.mockResolvedValue(
    fakeFileWriter() as unknown as ReturnType<KioskBrowser.Kiosk['writeFile']>
  );
  window.kiosk = kiosk;

  fetchMock.reset();
  fetchMock.get('/machine-config', { body: getMachineConfigBody });

  apiMock.mockApiClient.reset();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('shows setup card reader screen when there is no card reader', async () => {
  apiMock.expectGetConfig();
  const hardware = MemoryHardware.build({ connectCardReader: false });
  renderApp({ hardware });
  await screen.findByText('Card Reader Not Detected');
});

test('shows insert USB Drive screen when there is no card reader', async () => {
  apiMock.expectGetConfig();
  kiosk.getUsbDriveInfo.mockResolvedValue([]);
  apiMock.expectGetScannerStatus(statusNoPaper);
  renderApp();
  await screen.findByText('No USB Drive Detected');
});

test('app can load and configure from a usb stick', async () => {
  apiMock.expectGetConfig({
    electionDefinition: undefined,
  });
  kiosk.getUsbDriveInfo.mockResolvedValue([]);
  apiMock.expectGetScannerStatus(statusNoPaper, 2);
  renderApp();
  await screen.findByText('VxScan is not configured');
  await screen.findByText('Insert a USB drive containing a ballot package.');

  apiMock.mockApiClient.configureFromBallotPackageOnUsbDrive
    .expectCallWith()
    .resolves(err('no_ballot_package_on_usb_drive'));
  kiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
  await screen.findByText('No ballot package found on the inserted USB drive.');

  // Remove the USB
  kiosk.getUsbDriveInfo.mockResolvedValue([]);
  await screen.findByText('Insert a USB drive containing a ballot package.');

  kiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
  apiMock.mockApiClient.configureFromBallotPackageOnUsbDrive
    .expectCallWith()
    .resolves(ok());
  apiMock.expectGetConfig({ electionDefinition: electionSampleDefinition });
  await screen.findByText('Polls Closed');
});

test('election manager must set precinct', async () => {
  apiMock.expectGetConfig({
    precinctSelection: undefined,
  });
  apiMock.expectGetScannerStatus(statusNoPaper, 3);
  const { card } = renderApp();
  await screen.findByText('No Precinct Selected');

  // Poll Worker card does nothing
  card.insertCard(pollWorkerCard);
  await screen.findByText('No Precinct Selected');
  card.removeCard();
  await advanceTimersAndPromises(1);

  // Insert Election Manager card and set precinct
  card.insertCard(electionManagerCard, electionSampleDefinition.electionData);
  await authenticateElectionManagerCard();
  screen.getByText(SELECT_PRECINCT_TEXT);
  apiMock.expectSetPrecinct(singlePrecinctSelectionFor('23'));
  apiMock.expectGetConfig({
    precinctSelection: singlePrecinctSelectionFor('23'),
  });
  userEvent.selectOptions(await screen.findByTestId('selectPrecinct'), '23');
  card.removeCard();
  // Confirm precinct is set and correct
  await screen.findByText('Polls Closed');
  screen.getByText('Center Springfield,');

  // Poll Worker card can be used to open polls now
  apiMock.expectGetCastVoteRecordsForTally([]);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to open the polls?');
});

test('election manager and poll worker configuration', async () => {
  const electionDefinition = electionSampleDefinition;
  let config: Partial<Scan.PrecinctScannerConfig> = { electionDefinition };
  apiMock.expectGetConfig(config);
  const { card, logger } = renderApp();
  apiMock.expectGetScannerStatus(statusNoPaper);
  await screen.findByText('Polls Closed');

  // Calibrate scanner as Election Manager
  card.insertCard(electionManagerCard, electionDefinition.electionData);
  await authenticateElectionManagerCard();
  userEvent.click(await screen.findByText('Calibrate Scanner'));
  await screen.findByText('Waiting for Paper');
  userEvent.click(await screen.findByText('Cancel'));
  expect(screen.queryByText('Waiting for Paper')).toBeNull();
  userEvent.click(await screen.findByText('Calibrate Scanner'));
  apiMock.expectGetScannerStatus(scannerStatus({ state: 'ready_to_scan' }));
  apiMock.mockApiClient.calibrate.expectCallWith().resolves(true);
  userEvent.click(await screen.findByText('Calibrate'));
  await screen.findByText('Calibration succeeded!');
  userEvent.click(screen.getByRole('button', { name: 'Close' }));

  // Change mode as Election Manager
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.expectSetTestMode(false);
  config = { ...config, isTestMode: true };
  apiMock.expectGetConfig(config);
  userEvent.click(await screen.findByText('Live Election Mode'));
  await screen.findByText('Loading');
  await advanceTimersAndPromises(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.AuthLogin,
    'election_manager',
    expect.objectContaining({ disposition: 'success' })
  );

  // Change precinct as Election Manager
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.expectSetPrecinct(singlePrecinctSelectionFor('23'));
  config = { ...config, precinctSelection: singlePrecinctSelectionFor('23') };
  apiMock.expectGetConfig(config);
  userEvent.selectOptions(await screen.findByTestId('selectPrecinct'), '23');
  await waitFor(() => {
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.PrecinctConfigurationChanged,
      'election_manager',
      expect.objectContaining({
        disposition: 'success',
        message: expect.stringContaining('Center Springfield'),
      })
    );
  });
  card.removeCard();
  await advanceTimersAndPromises(1);

  // Open the polls
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.expectGetCastVoteRecordsForTally([]);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to open the polls?');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.AuthLogin,
    'poll_worker',
    expect.objectContaining({ disposition: 'success' })
  );

  apiMock.expectGetScannerStatus(statusNoPaper, 2);
  apiMock.expectSetPollsState('polls_open');
  config = { ...config, pollsState: 'polls_open' };
  apiMock.expectGetConfig(config);
  userEvent.click(await screen.findByText('Yes, Open the Polls'));
  await advanceTimersAndPromises(1);
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  card.removeCard();
  await advanceTimersAndPromises(1);

  // Change precinct as Election Manager with polls open
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.expectSetPrecinct(singlePrecinctSelectionFor('20'));
  config = {
    ...config,
    precinctSelection: singlePrecinctSelectionFor('20'),
    pollsState: 'polls_closed_initial',
  };
  apiMock.expectGetConfig(config);
  card.insertCard(electionManagerCard, electionDefinition.electionData);
  await authenticateElectionManagerCard();
  userEvent.click(screen.getByText('Change Precinct'));
  screen.getByText(/WARNING/);
  userEvent.selectOptions(await screen.findByTestId('selectPrecinct'), '20');
  userEvent.click(screen.getByText('Confirm'));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  await waitFor(() => {
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.PrecinctConfigurationChanged,
      'election_manager',
      expect.objectContaining({
        disposition: 'success',
        message: expect.stringContaining('South Springfield'),
      })
    );
  });
  card.removeCard();
  await screen.findByText('Polls Closed');
  await screen.findByText('South Springfield,');

  // Open the polls again
  apiMock.expectGetScannerStatus(statusNoPaper, 2);
  apiMock.expectGetCastVoteRecordsForTally([]);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to open the polls?');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.AuthLogin,
    'poll_worker',
    expect.objectContaining({ disposition: 'success' })
  );
  apiMock.expectSetPollsState('polls_open');
  config = {
    ...config,
    pollsState: 'polls_open',
  };
  apiMock.expectGetConfig(config);
  userEvent.click(await screen.findByText('Yes, Open the Polls'));
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  card.removeCard();
  await advanceTimersAndPromises(1);

  // Remove card and insert election manager card to unconfigure
  apiMock.expectGetScannerStatus(
    {
      ...statusNoPaper,
      canUnconfigure: true,
      ballotsCounted: 1,
    },
    3
  );
  card.insertCard(electionManagerCard, electionDefinition.electionData);
  await authenticateElectionManagerCard();
  // Confirm we can't unconfigure just by changing precinct
  expect(await screen.findByTestId('selectPrecinct')).toBeDisabled();
  userEvent.click(
    await screen.findByText('Delete All Election Data from VxScan')
  );
  await screen.findByText(
    'Do you want to remove all election information and data from this machine?'
  );
  userEvent.click(await screen.findByText('Cancel'));
  expect(
    screen.queryByText(
      'Do you want to remove all election information and data from this machine?'
    )
  ).toBeNull();

  // Actually unconfigure
  apiMock.mockApiClient.unconfigureElection.expectCallWith({}).resolves();
  apiMock.expectGetConfig({ electionDefinition: undefined });
  userEvent.click(
    await screen.findByText('Delete All Election Data from VxScan')
  );
  userEvent.click(await screen.findByText('Yes, Delete All'));
  await screen.findByText('Loading');
  await screen.findByText('VxScan is not configured');
  expect(kiosk.unmountUsbDrive).toHaveBeenCalledTimes(1);
});

test('voter can cast a ballot that scans successfully ', async () => {
  apiMock.expectGetConfig({
    pollsState: 'polls_open',
  });
  const { card } = renderApp();
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject');
  apiMock.expectGetScannerStatus(statusNoPaper);
  await screen.findByText('Insert Your Ballot Below');
  screen.getByText('Scan one ballot sheet at a time.');
  screen.getByText('General Election');
  screen.getByText(/Franklin County/);
  screen.getByText(/State of Hamilton/);
  screen.getByText('Election ID');
  screen.getByText('748dc61ad3');

  apiMock.expectGetScannerStatus(scannerStatus({ state: 'ready_to_scan' }));
  apiMock.mockApiClient.scanBallot.expectCallWith().resolves();
  apiMock.expectGetScannerStatus(scannerStatus({ state: 'scanning' }));
  apiMock.expectGetScannerStatus(scannerStatus({ state: 'ready_to_accept' }));
  apiMock.mockApiClient.acceptBallot.expectCallWith().resolves();
  apiMock.expectGetScannerStatus(scannerStatus({ state: 'accepted' }));
  const statusBallotCounted = scannerStatus({
    state: 'no_paper',
    ballotsCounted: 1,
  });
  apiMock.expectGetScannerStatus(statusBallotCounted);

  // trigger scan
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  screen.getByText(/Please wait/);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  screen.getByText('Your ballot was counted!');
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  await screen.findByText('Scan one ballot sheet at a time.');
  expect((await screen.findByTestId('ballot-count')).textContent).toBe('1');

  // Insert a pollworker card
  apiMock.expectGetScannerStatus(statusBallotCounted, 6);
  const mockCvrs = [
    generateCvr(
      electionSample,
      {
        president: ['cramer-vuocolo'],
        senator: [],
        'secretary-of-state': ['shamsi', 'talarico'],
        'county-registrar-of-wills': ['write-in'],
        'judicial-robert-demergue': ['yes'],
      },
      {
        precinctId: '23',
        ballotStyleId: '12',
      }
    ),
  ];
  apiMock.expectGetCastVoteRecordsForTally(mockCvrs);
  apiMock.expectExportCastVoteRecordsToUsbDrive(machineId);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to close the polls?');

  // Close Polls
  apiMock.expectSetPollsState('polls_closed_final');
  apiMock.expectGetConfig({
    pollsState: 'polls_closed_final',
  });

  userEvent.click(await screen.findByText('Yes, Close the Polls'));
  await screen.findByText('Closing Polls…');
  await screen.findByText('Polls are closed.');
  expect(writeLongObjectMock).toHaveBeenCalledTimes(1);
  expect(writeLongObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 1,
      machineId: '0002',
      timeSaved: expect.anything(),
      precinctSelection: ALL_PRECINCTS_SELECTION,
      // The export endpoint is mocked to return no CVR data so we still expect a zero tally
      tally: expect.arrayContaining([
        [0, 0, 1, 0, 1, 0, 0, 0, 0, 0], // President expected tally
        [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], // Senator expected tally
        [0, 1, 1, 0, 0, 0], // Secretary of State expected tally
        [0, 0, 1, 0, 1], // County Registrar of Wills expected tally
        [0, 0, 1, 1, 0], // Judicial Robert Demergue expected tally
      ]),
    })
  );

  // Simulate unmounted usb drive
  kiosk.getUsbDriveInfo.mockResolvedValue([
    fakeUsbDrive({ mountPoint: undefined }),
  ]);
  await advanceTimersAndPromises(2);
  // Remove the usb drive
  kiosk.getUsbDriveInfo.mockResolvedValue([]);
  await advanceTimersAndPromises(2);

  // Remove pollworker card
  card.removeCard();
  await advanceTimersAndPromises(1);

  // Insert Election Manager Card
  card.insertCard(electionManagerCard, electionSampleDefinition.electionData);
  await authenticateElectionManagerCard();
  await screen.findByText('Election Manager Settings');
  userEvent.click(await screen.findByText('Save CVRs'));
  await screen.findByText('No USB Drive Detected');
  userEvent.click(await screen.findByText('Cancel'));
  expect(screen.queryByText('No USB Drive Detected')).toBeNull();
  userEvent.click(await screen.findByText('Save CVRs'));
  await screen.findByText('No USB Drive Detected');
  userEvent.click(await screen.findByText('Cancel'));
  expect(screen.queryByText('No USB Drive Detected')).toBeNull();
  // Insert usb drive
  kiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
  await advanceTimersAndPromises(2);
  userEvent.click(await screen.findByText('Save CVRs'));

  apiMock.expectExportCastVoteRecordsToUsbDrive(machineId);
  expect(screen.getAllByText('Save CVRs')).toHaveLength(2);
  userEvent.click(await screen.findByText('Save'));
  await screen.findByText('CVRs Saved to USB Drive');
  userEvent.click(await screen.findByText('Eject USB'));
  expect(screen.queryByText('Eject USB')).toBeNull();
  await advanceTimersAndPromises(1);
  expect(fetchMock.done()).toBe(true);
});

test('voter can cast a ballot that needs review and adjudicate as desired', async () => {
  apiMock.expectGetConfig({ pollsState: 'polls_open' });
  apiMock.expectGetScannerStatus(statusNoPaper);
  renderApp();
  await screen.findByText('Insert Your Ballot Below');

  const interpretation: Scan.SheetInterpretation = {
    type: 'NeedsReviewSheet',
    reasons: [{ type: AdjudicationReason.BlankBallot }],
  };
  apiMock.expectGetScannerStatus(scannerStatus({ state: 'ready_to_scan' }));
  apiMock.mockApiClient.scanBallot.expectCallWith().resolves();
  apiMock.expectGetScannerStatus(scannerStatus({ state: 'scanning' }));
  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'needs_review', interpretation })
  );

  // trigger scan
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Please wait/);
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('No votes were found when scanning this ballot.');

  apiMock.mockApiClient.acceptBallot.expectCallWith().resolves();
  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'accepting_after_review', interpretation })
  );
  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'accepted', interpretation })
  );
  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'no_paper', ballotsCounted: 1 })
  );

  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot As Is' }));
  await screen.findByText('Are you sure?');
  userEvent.click(
    screen.getByRole('button', { name: 'Yes, Cast Ballot As Is' })
  );

  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('Your ballot was counted!');
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('Insert Your Ballot Below');
  expect(screen.getByTestId('ballot-count').textContent).toBe('1');
});

test('voter tries to cast ballot that is rejected', async () => {
  apiMock.expectGetConfig({ pollsState: 'polls_open' });
  apiMock.expectGetScannerStatus(statusNoPaper);
  renderApp();
  await screen.findByText('Insert Your Ballot Below');

  apiMock.expectGetScannerStatus(scannerStatus({ state: 'ready_to_scan' }));
  apiMock.mockApiClient.scanBallot.expectCallWith().resolves();
  apiMock.expectGetScannerStatus(scannerStatus({ state: 'scanning' }));
  apiMock.expectGetScannerStatus(
    scannerStatus({
      state: 'rejected',
      interpretation: {
        type: 'InvalidSheet',
        reason: 'invalid_election_hash',
      },
    })
  );

  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Please wait/);
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('Ballot Not Counted');
  screen.getByText(
    'The ballot does not match the election this scanner is configured for.'
  );

  // When the voter removes the ballot return to the insert ballot screen
  apiMock.expectGetScannerStatus(statusNoPaper);
  await screen.findByText('Insert Your Ballot Below');
});

test('voter can cast another ballot while the success screen is showing', async () => {
  apiMock.expectGetConfig({ pollsState: 'polls_open' });
  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'accepted', ballotsCounted: 1 })
  );
  renderApp();
  await screen.findByText('Your ballot was counted!');

  screen.getByText('Your ballot was counted!');
  expect(screen.getByTestId('ballot-count').textContent).toBe('1');

  apiMock.expectGetScannerStatus(scannerStatus({ state: 'ready_to_scan' }));
  apiMock.mockApiClient.scanBallot.expectCallWith().resolves();
  apiMock.expectGetScannerStatus(scannerStatus({ state: 'scanning' }));
  apiMock.expectGetScannerStatus(
    scannerStatus({
      state: 'needs_review',
      interpretation: {
        type: 'NeedsReviewSheet',
        reasons: [{ type: AdjudicationReason.BlankBallot }],
      },
    })
  );

  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Please wait/);
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('No votes were found when scanning this ballot.');
});

test('scanning is not triggered when polls closed or cards present', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetScannerStatus(scannerStatus({ state: 'ready_to_scan' }), 3);
  const { card } = renderApp();
  await screen.findByText('Polls Closed');
  apiMock.expectGetCastVoteRecordsForTally([]);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to open the polls?');
  // Open Polls
  apiMock.expectSetPollsState('polls_open');
  apiMock.expectGetConfig({ pollsState: 'polls_open' });
  userEvent.click(screen.getByText('Yes, Open the Polls'));
  await screen.findByText('Polls are open.');

  // Once we remove the poll worker card, scanning should start
  apiMock.mockApiClient.scanBallot.expectCallWith().resolves();
  card.removeCard();
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Please wait/);
  expect(fetchMock.done()).toBe(true);
});

test('no printer: poll worker can open and close polls without scanning any ballots', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetScannerStatus(statusNoPaper, 2);
  const { card } = renderApp();
  await screen.findByText('Polls Closed');
  apiMock.expectGetCastVoteRecordsForTally([]);

  // Open Polls Flow
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to open the polls?');
  apiMock.expectSetPollsState('polls_open');
  apiMock.expectGetConfig({ pollsState: 'polls_open' });
  userEvent.click(await screen.findByText('Yes, Open the Polls'));
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  card.removeCard();
  await screen.findByText('Insert Your Ballot Below');

  // Close Polls Flow
  apiMock.expectGetCastVoteRecordsForTally([]);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to close the polls?');
  apiMock.expectSetPollsState('polls_closed_final');
  apiMock.expectGetConfig({ pollsState: 'polls_closed_final' });
  userEvent.click(await screen.findByText('Yes, Close the Polls'));
  await screen.findByText('Closing Polls…');
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  card.removeCard();
  await screen.findByText('Polls Closed');
});

test('with printer: poll worker can open and close polls without scanning any ballots', async () => {
  apiMock.expectGetConfig({ pollsState: 'polls_closed_initial' });
  apiMock.expectGetScannerStatus(statusNoPaper, 5);
  const hardware = MemoryHardware.build({
    connectCardReader: true,
    connectPrinter: true,
  });
  const { card } = renderApp({ hardware });
  await screen.findByText('Polls Closed');

  // Open Polls Flow
  apiMock.expectGetCastVoteRecordsForTally([]);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to open the polls?');
  apiMock.expectSetPollsState('polls_open');
  apiMock.expectGetConfig({ pollsState: 'polls_open' });
  userEvent.click(screen.getByRole('button', { name: 'Yes, Open the Polls' }));
  await screen.findByText('Polls are open.');
  await expectPrint();
  userEvent.click(
    screen.getByRole('button', { name: 'Print Additional Polls Opened Report' })
  );
  await screen.findByText('Printing Report…');
  await expectPrint();
  await advanceTimersAndPromises(REPRINT_REPORT_TIMEOUT_SECONDS);
  await screen.findByText('Polls are open.');
  screen.getByRole('button', { name: 'Print Additional Polls Opened Report' });
  screen.getByText('Remove the poll worker card', { exact: false });
  card.removeCard();
  await screen.findByText('Insert Your Ballot Below');

  // Close Polls Flow
  apiMock.expectGetCastVoteRecordsForTally([]);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to close the polls?');
  apiMock.expectSetPollsState('polls_closed_final');
  apiMock.expectGetConfig({ pollsState: 'polls_closed_final' });
  userEvent.click(screen.getByRole('button', { name: 'Yes, Close the Polls' }));
  await screen.findByText('Polls are closed.');
  await expectPrint();
  userEvent.click(
    screen.getByRole('button', { name: 'Print Additional Polls Closed Report' })
  );
  await screen.findByText('Printing Report…');
  await expectPrint();
  await advanceTimersAndPromises(REPRINT_REPORT_TIMEOUT_SECONDS);
  await screen.findByText('Polls are closed.');
  screen.getByRole('button', { name: 'Print Additional Polls Closed Report' });
  screen.getByText('Remove the poll worker card', { exact: false });
  card.removeCard();
  await screen.findByText('Polls Closed');
});

test('no printer: open polls, scan ballot, close polls, save results', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetScannerStatus(statusNoPaper, 2);
  const { card } = renderApp();
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject');
  await screen.findByText('Polls Closed');

  // Open Polls Flow
  apiMock.expectGetCastVoteRecordsForTally([]);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to open the polls?');
  apiMock.expectSetPollsState('polls_open');
  apiMock.expectGetConfig({ pollsState: 'polls_open' });
  userEvent.click(await screen.findByText('Yes, Open the Polls'));
  expect(writeLongObjectMock).toHaveBeenCalledTimes(1);
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  card.removeCard();
  await screen.findByText('Insert Your Ballot Below');

  // Voter scans a ballot
  apiMock.expectGetScannerStatus(scannerStatus({ state: 'ready_to_scan' }));
  apiMock.mockApiClient.scanBallot.expectCallWith().resolves();
  apiMock.expectGetScannerStatus(scannerStatus({ state: 'scanning' }));
  apiMock.expectGetScannerStatus(scannerStatus({ state: 'ready_to_accept' }));
  apiMock.mockApiClient.acceptBallot.expectCallWith().resolves();
  apiMock.mockApiClient.acceptBallot.expectCallWith().resolves();
  apiMock.expectGetScannerStatus(scannerStatus({ state: 'accepted' }));
  const statusBallotCounted = scannerStatus({
    state: 'no_paper',
    ballotsCounted: 1,
  });
  apiMock.expectGetScannerStatus(statusBallotCounted);

  // trigger scan
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  screen.getByText(/Please wait/);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  screen.getByText('Your ballot was counted!');
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  await screen.findByText('Scan one ballot sheet at a time.');
  expect((await screen.findByTestId('ballot-count')).textContent).toBe('1');

  // Close Polls
  const mockCvrs = [
    generateCvr(
      electionSample,
      {
        president: ['cramer-vuocolo'],
        senator: [],
        'secretary-of-state': ['shamsi', 'talarico'],
        'county-registrar-of-wills': ['write-in'],
        'judicial-robert-demergue': ['yes'],
      },
      {
        precinctId: '23',
        ballotStyleId: '12',
      }
    ),
  ];
  apiMock.expectGetCastVoteRecordsForTally(mockCvrs);
  apiMock.expectExportCastVoteRecordsToUsbDrive(machineId);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to close the polls?');
  apiMock.expectSetPollsState('polls_closed_final');
  apiMock.expectGetConfig({ pollsState: 'polls_closed_final' });
  userEvent.click(await screen.findByText('Yes, Close the Polls'));
  await screen.findByText('Closing Polls…');
  await screen.findByText('Polls are closed.');
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  expect(writeLongObjectMock).toHaveBeenCalledTimes(2);
  expect(writeLongObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 1,
      machineId: '0002',
      timeSaved: expect.anything(),
      precinctSelection: ALL_PRECINCTS_SELECTION,
      // The export endpoint is mocked to return no CVR data so we still expect a zero tally
      tally: expect.arrayContaining([
        [0, 0, 1, 0, 1, 0, 0, 0, 0, 0], // President expected tally
        [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], // Senator expected tally
        [0, 1, 1, 0, 0, 0], // Secretary of State expected tally
        [0, 0, 1, 0, 1], // County Registrar of Wills expected tally
        [0, 0, 1, 1, 0], // Judicial Robert Demergue expected tally
      ]),
    })
  );

  card.removeCard();
  await screen.findByText('Polls Closed');
});

test('poll worker can open, pause, unpause, and close poll without scanning any ballots', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetScannerStatus(statusNoPaper, 4);
  const { card } = renderApp();
  await screen.findByText('Polls Closed');

  // Open Polls
  apiMock.expectGetCastVoteRecordsForTally([]);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to open the polls?');
  apiMock.expectSetPollsState('polls_open');
  apiMock.expectGetConfig({ pollsState: 'polls_open' });
  userEvent.click(await screen.findByText('Yes, Open the Polls'));
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  card.removeCard();
  await screen.findByText('Insert Your Ballot Below');

  // Pause Voting Flow
  apiMock.expectGetCastVoteRecordsForTally([]);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to close the polls?');
  userEvent.click(await screen.findByText('No'));
  apiMock.expectSetPollsState('polls_paused');
  apiMock.expectGetConfig({ pollsState: 'polls_paused' });
  userEvent.click(await screen.findByText('Pause Voting'));
  await screen.findByText('Pausing Voting…');
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  card.removeCard();
  await screen.findByText('Polls Paused');

  // Resume Voting Flow
  apiMock.expectGetCastVoteRecordsForTally([]);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to resume voting?');
  apiMock.expectSetPollsState('polls_open');
  apiMock.expectGetConfig({ pollsState: 'polls_open' });
  userEvent.click(await screen.findByText('Yes, Resume Voting'));
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  card.removeCard();
  await screen.findByText('Insert Your Ballot Below');

  // Close Polls Flow
  apiMock.expectGetCastVoteRecordsForTally([]);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to close the polls?');
  apiMock.expectSetPollsState('polls_closed_final');
  apiMock.expectGetConfig({ pollsState: 'polls_closed_final' });
  userEvent.click(await screen.findByText('Yes, Close the Polls'));
  await screen.findByText('Closing Polls…');
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  card.removeCard();
  await screen.findByText('Polls Closed');
});

test('system administrator can log in and unconfigure machine', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetScannerStatus(statusNoPaper, 2);
  const { card } = renderApp();

  card.insertCard(makeSystemAdministratorCard());
  await screen.findByText('Enter the card security code to unlock.');
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('2'));
  userEvent.click(screen.getByText('3'));
  userEvent.click(screen.getByText('4'));
  userEvent.click(screen.getByText('5'));
  userEvent.click(screen.getByText('6'));

  await screen.findByRole('button', { name: 'Reboot from USB' });
  screen.getByRole('button', { name: 'Reboot to BIOS' });
  const unconfigureMachineButton = screen.getByRole('button', {
    name: 'Unconfigure Machine',
  });

  apiMock.mockApiClient.unconfigureElection
    .expectCallWith({ ignoreBackupRequirement: true })
    .resolves();
  apiMock.expectGetConfig({ electionDefinition: undefined });
  userEvent.click(unconfigureMachineButton);
  const modal = await screen.findByRole('alertdialog');
  userEvent.click(
    within(modal).getByRole('button', {
      name: 'Yes, Delete Election Data',
    })
  );
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

  card.removeCard();
});

test('system administrator allowed to log in on unconfigured machine', async () => {
  apiMock.expectGetConfig({ electionDefinition: undefined });

  const { card } = renderApp();

  card.insertCard(makeSystemAdministratorCard());
  await screen.findByText('Enter the card security code to unlock.');
});

test('system administrator can reset polls to paused', async () => {
  apiMock.expectGetConfig({
    pollsState: 'polls_closed_final',
  });
  apiMock.expectGetScannerStatus(statusNoPaper, 2);
  const { card } = renderApp();
  await screen.findByText('Polls Closed');

  card.insertCard(makeSystemAdministratorCard());
  await screen.findByText('Enter the card security code to unlock.');
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('2'));
  userEvent.click(screen.getByText('3'));
  userEvent.click(screen.getByText('4'));
  userEvent.click(screen.getByText('5'));
  userEvent.click(screen.getByText('6'));

  userEvent.click(
    await screen.findByRole('button', { name: 'Reset Polls to Paused' })
  );
  const modal = await screen.findByRole('alertdialog');
  apiMock.expectSetPollsState('polls_paused');
  apiMock.expectGetConfig({ pollsState: 'polls_paused' });
  userEvent.click(
    await within(modal).findByRole('button', { name: 'Reset Polls to Paused' })
  );
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  card.removeCard();
  await screen.findByText('Polls Paused');
});

test('election manager cannot auth onto machine with different election hash', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetScannerStatus(statusNoPaper);
  const { card } = renderApp();

  card.insertCard(
    makeElectionManagerCard(electionSample2Definition.electionHash)
  );
  await screen.findByText('Invalid Card');
});

test('replace ballot bag flow', async () => {
  apiMock.expectGetConfig({
    pollsState: 'polls_open',
  });
  apiMock.expectGetScannerStatus(statusNoPaper);
  const { card, logger } = renderApp();
  await screen.findByText('Insert Your Ballot Below');

  apiMock.expectGetScannerStatus(scannerStatus({ state: 'ready_to_scan' }));
  apiMock.mockApiClient.scanBallot.expectCallWith().resolves();
  apiMock.expectGetScannerStatus(scannerStatus({ state: 'scanning' }));
  apiMock.expectGetScannerStatus(scannerStatus({ state: 'ready_to_accept' }));
  apiMock.mockApiClient.acceptBallot.expectCallWith().resolves();
  apiMock.expectGetScannerStatus(scannerStatus({ state: 'accepted' }));
  apiMock.expectGetScannerStatus(
    scannerStatus({
      state: 'no_paper',
      ballotsCounted: BALLOT_BAG_CAPACITY,
    }),
    6
  );

  // trigger scan
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  screen.getByText(/Please wait/);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);

  // we should see still see accepted screen
  screen.getByText('Your ballot was counted!');
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);

  // should go to modal after accepted screen
  await screen.findByText('Ballot Bag Full');

  // Insert a pollworker card to enter confirmation step
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Ballot Bag Replaced?');

  // Removing card at this point returns to initial screen
  card.removeCard();
  await advanceTimersAndPromises(1);
  await screen.findByText('Ballot Bag Full');

  // Can confirm with pollworker card
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Ballot Bag Replaced?');
  userEvent.click(screen.getByText('Yes, New Ballot Bag is Ready'));

  // Prompted to remove card
  await advanceTimersAndPromises(1);
  await screen.findByText('Remove card to resume voting.');

  // Removing card returns to voter screen
  apiMock.mockApiClient.recordBallotBagReplaced.expectCallWith().resolves();
  apiMock.expectGetConfig({
    pollsState: 'polls_open',
    ballotCountWhenBallotBagLastReplaced: BALLOT_BAG_CAPACITY,
  });
  card.removeCard();
  await advanceTimersAndPromises(1);
  await screen.findByText('Insert Your Ballot Below');

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.BallotBagReplaced,
    'poll_worker',
    expect.anything()
  );

  // Does not prompt again if new threshold hasn't been reached
  apiMock.expectGetScannerStatus(
    scannerStatus({
      state: 'no_paper',
      ballotsCounted: BALLOT_BAG_CAPACITY * 2 - 1,
    })
  );
  await advanceTimersAndPromises(1);
  await screen.findByText('Insert Your Ballot Below');

  // Prompts again if new threshold has been reached
  apiMock.expectGetScannerStatus(
    scannerStatus({
      state: 'no_paper',
      ballotsCounted: BALLOT_BAG_CAPACITY * 2,
    })
  );
  await advanceTimersAndPromises(1);
  await screen.findByText('Ballot Bag Full');
});
