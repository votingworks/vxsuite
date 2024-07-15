import { singlePrecinctSelectionFor } from '@votingworks/utils';
import userEvent from '@testing-library/user-event';
import {
  advanceTimersAndPromises,
  mockSystemAdministratorUser,
  mockOf,
} from '@votingworks/test-utils';
import {
  electionGeneralDefinition,
  electionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import {
  AdjudicationReason,
  ElectionPackageConfigurationError,
  SheetInterpretation,
  getDisplayBallotHash,
} from '@votingworks/types';
import { Result, deferred, err, ok } from '@votingworks/basics';

import type { PrecinctScannerConfig } from '@votingworks/scan-backend';
import { waitFor, screen, within, render } from '../test/react_testing_library';
import {
  BALLOT_BAG_CAPACITY,
  POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
} from './config/globals';
import { scannerStatus } from '../test/helpers/helpers';
import { SELECT_PRECINCT_TEXT } from './screens/election_manager_screen';
import {
  ApiMock,
  createApiMock,
  statusNoPaper,
} from '../test/helpers/mock_api_client';
import { App, AppProps } from './app';
import { VoterSettingsManager } from './components/voter_settings_manager';

jest.mock(
  './components/voter_settings_manager',
  (): typeof import('./components/voter_settings_manager') => ({
    VoterSettingsManager: jest.fn(),
  })
);

let apiMock: ApiMock;

jest.setTimeout(20000);

function renderApp(props: Partial<AppProps> = {}) {
  render(<App apiClient={apiMock.mockApiClient} {...props} />);
}

beforeEach(() => {
  jest.useFakeTimers();

  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.setBatteryInfo();
  apiMock.removeCard(); // Set a default auth state of no card inserted.

  mockOf(VoterSettingsManager).mockReturnValue(null);
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();

  mockOf(VoterSettingsManager).mockReset();
});

test('shows setup card reader screen when there is no card reader', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_closed_initial');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'no_card_reader',
  });
  renderApp();
  await screen.findByText('Card Reader Not Detected');
});

test('shows insert USB Drive screen when there is no USB drive', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_closed_initial');
  apiMock.expectGetUsbDriveStatus('no_drive');
  apiMock.expectGetScannerStatus(statusNoPaper);
  renderApp();
  await screen.findByText('No USB Drive Detected');
});

test('app can load and configure from a usb stick', async () => {
  apiMock.authenticateAsElectionManager(electionGeneralDefinition);
  apiMock.expectGetConfig({
    electionDefinition: undefined,
  });
  apiMock.expectGetPollsInfo('polls_closed_initial');
  apiMock.expectGetUsbDriveStatus('no_drive');
  apiMock.expectGetScannerStatus(statusNoPaper);
  renderApp();
  await screen.findByText(
    'Insert an Election Manager card to configure VxScan'
  );
  await screen.findByText('Insert a USB drive containing an election package');

  // Insert a USB with no election package
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.mockApiClient.configureFromElectionPackageOnUsbDrive
    .expectCallWith()
    .resolves(err('no_election_package_on_usb_drive'));
  apiMock.expectGetConfig({
    electionDefinition: undefined,
  });
  await screen.findByText(
    'No election package found on the inserted USB drive.'
  );

  // Remove the USB
  apiMock.expectGetUsbDriveStatus('no_drive');
  await screen.findByText('Insert a USB drive containing an election package');

  // Insert a USB with an election package
  apiMock.expectGetUsbDriveStatus('mounted');
  const { promise: configurePromise, resolve: configureResolve } =
    deferred<Result<void, ElectionPackageConfigurationError>>();
  apiMock.mockApiClient.configureFromElectionPackageOnUsbDrive
    .expectCallWith()
    .returns(configurePromise);
  apiMock.expectGetConfig({ electionDefinition: electionGeneralDefinition });
  await screen.findByText('Configuring VxScan from USB drive…');
  configureResolve(ok());

  // Select precinct
  apiMock.setPrinterStatusV3({ connected: true });
  await screen.findByText('Election Manager Settings');
  screen.getByText(SELECT_PRECINCT_TEXT);
  apiMock.expectSetPrecinct(singlePrecinctSelectionFor('23'));
  apiMock.expectGetConfig({
    precinctSelection: singlePrecinctSelectionFor('23'),
  });
  apiMock.expectGetPollsInfo('polls_closed_initial');
  userEvent.selectOptions(await screen.findByTestId('selectPrecinct'), '23');
  apiMock.removeCard();

  await screen.findByText('Polls Closed');
});

test('election manager must set precinct', async () => {
  apiMock.expectGetConfig({
    precinctSelection: undefined,
  });
  apiMock.expectGetPollsInfo('polls_closed_initial');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatusV3({ connected: true });
  renderApp();
  await screen.findByText('No Precinct Selected');

  // Poll Worker card does nothing
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('No Precinct Selected');
  apiMock.removeCard();
  await advanceTimersAndPromises(1);

  // Insert Election Manager card and set precinct
  apiMock.authenticateAsElectionManager(electionGeneralDefinition);
  await screen.findByText('Election Manager Settings');
  screen.getByText(SELECT_PRECINCT_TEXT);
  apiMock.expectSetPrecinct(singlePrecinctSelectionFor('23'));
  apiMock.expectGetConfig({
    precinctSelection: singlePrecinctSelectionFor('23'),
  });
  apiMock.expectGetPollsInfo('polls_closed_initial');
  userEvent.selectOptions(await screen.findByTestId('selectPrecinct'), '23');
  apiMock.removeCard();
  // Confirm precinct is set and correct
  await screen.findByText('Polls Closed');
  screen.getByText('Center Springfield');

  // Poll Worker card can be used to open polls now
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('Do you want to open the polls?');
});

test('election manager and poll worker configuration', async () => {
  const electionDefinition = electionGeneralDefinition;
  let config: Partial<PrecinctScannerConfig> = { electionDefinition };
  apiMock.expectGetConfig(config);
  apiMock.expectGetPollsInfo('polls_closed_initial');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.setPrinterStatusV3({ connected: true });
  renderApp();
  await screen.findByText('Polls Closed');

  // Change mode as Election Manager
  apiMock.authenticateAsElectionManager(electionDefinition);
  await screen.findByText('Election Manager Settings');

  apiMock.expectSetTestMode(false);
  config = { ...config, isTestMode: false };
  apiMock.expectGetConfig(config);
  apiMock.expectGetPollsInfo('polls_closed_initial');

  userEvent.click(
    await screen.findByRole('option', {
      name: 'Official Ballot Mode',
      selected: false,
    })
  );
  await screen.findByRole('option', {
    name: 'Official Ballot Mode',
    selected: true,
  });

  // Change precinct as Election Manager
  const precinct = electionDefinition.election.precincts[0];
  const precinctSelection = singlePrecinctSelectionFor(precinct.id);
  apiMock.expectSetPrecinct(precinctSelection);
  config = { ...config, precinctSelection };
  apiMock.expectGetConfig(config);
  apiMock.expectGetPollsInfo('polls_closed_initial');
  userEvent.selectOptions(
    await screen.findByTestId('selectPrecinct'),
    precinct.id
  );
  await screen.findByDisplayValue(precinct.name);
  apiMock.removeCard();

  // Open the polls
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.expectOpenPolls();
  apiMock.expectPrintReportV3();
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.authenticateAsPollWorker(electionDefinition);
  userEvent.click(await screen.findByText('Yes, Open the Polls'));
  await screen.findByText(
    'Remove the poll worker card once you have printed all necessary reports.'
  );
  apiMock.removeCard();
  await advanceTimersAndPromises(1);

  // Change precinct as Election Manager with polls open
  apiMock.expectSetPrecinct(singlePrecinctSelectionFor('20'));
  config = {
    ...config,
    precinctSelection: singlePrecinctSelectionFor('20'),
  };
  apiMock.expectGetConfig(config);
  apiMock.expectGetPollsInfo('polls_closed_initial');
  apiMock.authenticateAsElectionManager(electionDefinition);
  await screen.findByText('Election Manager Settings');
  userEvent.click(screen.getByText('Change Precinct'));
  screen.getByText(/WARNING/);
  userEvent.selectOptions(await screen.findByTestId('selectPrecinct'), '20');
  userEvent.click(screen.getByText('Confirm'));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  apiMock.removeCard();
  await screen.findByText('Polls Closed');
  await screen.findByText('South Springfield');

  // Open the polls again
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.expectOpenPolls();
  apiMock.expectPrintReportV3();
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.authenticateAsPollWorker(electionDefinition);
  await screen.findByText('Do you want to open the polls?');
  userEvent.click(await screen.findByText('Yes, Open the Polls'));

  await screen.findByText(
    'Remove the poll worker card once you have printed all necessary reports.'
  );
  apiMock.removeCard();
  await advanceTimersAndPromises(1);

  // Remove card and insert election manager card to unconfigure
  apiMock.expectGetScannerStatus({
    ...statusNoPaper,
    ballotsCounted: 1,
  });
  apiMock.authenticateAsElectionManager(electionDefinition);
  await screen.findByText('Election Manager Settings');
  // Confirm we can't unconfigure just by changing precinct
  expect(await screen.findByTestId('selectPrecinct')).toBeDisabled();

  userEvent.click(await screen.findByText('Unconfigure Machine'));
  userEvent.click(await screen.findByText('Cancel'));

  // Actually unconfigure
  apiMock.mockApiClient.unconfigureElection.expectCallWith().resolves();
  apiMock.expectGetConfig({ electionDefinition: undefined });
  apiMock.expectGetPollsInfo();
  apiMock.mockApiClient.ejectUsbDrive.expectCallWith().resolves();
  apiMock.expectGetUsbDriveStatus('ejected');
  userEvent.click(await screen.findByText('Unconfigure Machine'));
  userEvent.click(await screen.findByText('Yes, Delete Election Data'));
  await screen.findByText('Insert a USB drive containing an election package');
});

const statusBallotCounted = scannerStatus({
  state: 'no_paper',
  ballotsCounted: 1,
});

async function scanBallot() {
  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'hardware_ready_to_scan' })
  );
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Please wait/);

  apiMock.expectGetScannerStatus(scannerStatus({ state: 'scanning' }));
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);

  apiMock.expectGetScannerStatus(scannerStatus({ state: 'ready_to_accept' }));
  apiMock.mockApiClient.acceptBallot.expectCallWith().resolves();
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);

  apiMock.expectGetScannerStatus(scannerStatus({ state: 'accepted' }));
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('Your ballot was counted!');

  apiMock.expectGetScannerStatus(statusBallotCounted);
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Insert Your Ballot/i);
  expect(screen.getByTestId('ballot-count').textContent).toEqual('1');
}

test('voter can cast a ballot that scans successfully ', async () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  apiMock.expectGetConfig({
    electionDefinition,
  });
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatusV3({ connected: true });
  renderApp();
  await screen.findByText(/Insert Your Ballot/i);
  screen.getByText('Scan one ballot sheet at a time.');
  screen.getByText('Example Primary Election');
  screen.getByText(/Sample County/);
  screen.getByText(/State of Sample/);
  screen.getByText('Election ID');
  within(screen.getByText('Election ID').parentElement!).getByText(
    getDisplayBallotHash(electionDefinition)
  );

  await scanBallot();

  // Insert a pollworker card
  apiMock.expectGetScannerStatus(statusBallotCounted);
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('Do you want to close the polls?');

  // Close Polls
  apiMock.expectClosePolls();
  apiMock.expectPrintReportV3();
  apiMock.expectGetPollsInfo('polls_closed_final');
  userEvent.click(await screen.findByText('Yes, Close the Polls'));
  await screen.findByText('Closing Polls…');
  await screen.findByText('Polls are closed.');

  // Simulate unmounted usb drive
  apiMock.expectGetUsbDriveStatus('ejected');
  await advanceTimersAndPromises(2);
  // Remove the usb drive
  apiMock.expectGetUsbDriveStatus('no_drive');
  await advanceTimersAndPromises(2);

  // Remove pollworker card
  apiMock.removeCard();
  await advanceTimersAndPromises(1);

  // Insert Election Manager Card
  apiMock.authenticateAsElectionManager(electionGeneralDefinition);
  await screen.findByText('Election Manager Settings');

  userEvent.click(screen.getByRole('tab', { name: 'CVRs and Logs' }));

  userEvent.click(await screen.findByText('Save CVRs'));
  await screen.findByText('No USB Drive Detected');
  userEvent.click(await screen.findByText('Cancel'));
  expect(screen.queryByText('No USB Drive Detected')).toBeNull();

  // Insert Usb Drive
  apiMock.expectGetUsbDriveStatus('mounted');
  await waitFor(() => {
    expect(screen.getButton('Save CVRs')).toBeEnabled();
  });
  userEvent.click(await screen.findButton('Save CVRs'));
  await screen.findByRole('heading', { name: 'Save CVRs' });

  apiMock.expectExportCastVoteRecordsToUsbDrive();
  userEvent.click(await screen.findByText('Save'));
  await screen.findByText('CVRs Saved');

  apiMock.mockApiClient.ejectUsbDrive.expectCallWith().resolves();
  apiMock.expectGetUsbDriveStatus('ejected');
  userEvent.click(await screen.findByText('Eject USB'));
  await waitFor(() => {
    expect(screen.queryByText('Eject USB')).toBeNull();
  });
});

test('voter can cast a ballot that needs review and adjudicate as desired', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  renderApp();
  await screen.findByText(/Insert Your Ballot/i);

  const interpretation: SheetInterpretation = {
    type: 'NeedsReviewSheet',
    reasons: [{ type: AdjudicationReason.BlankBallot }],
  };
  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'hardware_ready_to_scan' })
  );
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Please wait/);

  apiMock.expectGetScannerStatus(scannerStatus({ state: 'scanning' }));
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);

  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'needs_review', interpretation })
  );
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('No votes were found when scanning this ballot.');
  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot As Is' }));
  await screen.findByText('Are you sure?');

  apiMock.mockApiClient.acceptBallot.expectCallWith().resolves();
  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'accepting_after_review', interpretation })
  );
  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'accepted', interpretation })
  );
  userEvent.click(
    screen.getByRole('button', { name: 'Yes, Cast Ballot As Is' })
  );
  await screen.findByText('Your ballot was counted!');

  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'no_paper', ballotsCounted: 1 })
  );
  await screen.findByText(/Insert Your Ballot/i);
  expect(screen.getByTestId('ballot-count').textContent).toEqual('1');
});

test('voter tries to cast ballot that is rejected', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  renderApp();
  await screen.findByText(/Insert Your Ballot/i);

  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'hardware_ready_to_scan' })
  );
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Please wait/);

  apiMock.expectGetScannerStatus(scannerStatus({ state: 'scanning' }));
  apiMock.expectGetScannerStatus(
    scannerStatus({
      state: 'rejected',
      interpretation: {
        type: 'InvalidSheet',
        reason: 'invalid_ballot_hash',
      },
    })
  );
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('Ballot Not Counted');
  screen.getByText(
    'The ballot does not match the election this scanner is configured for.'
  );

  // When the voter removes the ballot return to the insert ballot screen
  apiMock.expectGetScannerStatus(statusNoPaper);
  await screen.findByText(/Insert Your Ballot/i);
});

test('voter can cast another ballot while the success screen is showing', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'accepted', ballotsCounted: 1 })
  );
  renderApp();
  await screen.findByText('Your ballot was counted!');
  expect(screen.getByTestId('ballot-count').textContent).toEqual('1');

  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'hardware_ready_to_scan' })
  );
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Please wait/);

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
  await screen.findByText('No votes were found when scanning this ballot.');
});

test('scanning is not triggered when polls closed or cards present', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_closed_initial');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'hardware_ready_to_scan' })
  );
  apiMock.setPrinterStatusV3({ connected: true });
  renderApp();
  await screen.findByText('Polls Closed');
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('Do you want to open the polls?');
  // Open Polls
  apiMock.expectOpenPolls();
  apiMock.expectPrintReportV3();
  apiMock.expectGetPollsInfo('polls_open');
  userEvent.click(screen.getByText('Yes, Open the Polls'));
  await screen.findByText('Polls are open.');

  // Once we remove the poll worker card, scanning should start
  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'hardware_ready_to_scan' })
  );
  apiMock.removeCard();
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Please wait/);
});

test('poll worker can open and close polls without scanning any ballots', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_closed_initial');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatusV3({ connected: true });
  renderApp();
  await screen.findByText('Polls Closed');

  // Open Polls Flow
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('Do you want to open the polls?');
  apiMock.expectOpenPolls();
  apiMock.expectPrintReportV3();
  apiMock.expectGetPollsInfo('polls_open');
  userEvent.click(screen.getByRole('button', { name: 'Yes, Open the Polls' }));
  await screen.findByText('Polls are open.');
  apiMock.expectPrintReportV3();
  userEvent.click(
    screen.getByRole('button', { name: 'Print Additional Polls Opened Report' })
  );
  await screen.findByText('Printing Report…');
  await screen.findByText('Polls are open.');
  screen.getByRole('button', { name: 'Print Additional Polls Opened Report' });
  screen.getByText('Remove the poll worker card', { exact: false });
  apiMock.removeCard();
  await screen.findByText(/Insert Your Ballot/i);

  // Close Polls Flow
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('Do you want to close the polls?');
  apiMock.expectClosePolls();
  apiMock.expectPrintReportV3();
  apiMock.expectGetPollsInfo('polls_closed_final');
  userEvent.click(screen.getByRole('button', { name: 'Yes, Close the Polls' }));
  await screen.findByText('Polls are closed.');
  apiMock.expectPrintReportV3();
  userEvent.click(
    screen.getByRole('button', { name: 'Print Additional Polls Closed Report' })
  );
  await screen.findByText('Printing Report…');
  await screen.findByText('Polls are closed.');
  screen.getByRole('button', { name: 'Print Additional Polls Closed Report' });
  screen.getByText('Remove the poll worker card', { exact: false });
  apiMock.removeCard();
  await screen.findByText('Polls Closed');
});

test('open polls, scan ballot, close polls, save results', async () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  apiMock.expectGetConfig({
    electionDefinition,
  });
  apiMock.expectGetPollsInfo();
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatusV3({ connected: true });
  renderApp();
  await screen.findByText('Polls Closed');
  // Open Polls Flow
  apiMock.authenticateAsPollWorker(electionDefinition);
  await screen.findByText('Do you want to open the polls?');
  apiMock.expectOpenPolls();
  apiMock.expectPrintReportV3();
  apiMock.expectGetPollsInfo('polls_open');
  userEvent.click(await screen.findByText('Yes, Open the Polls'));
  await screen.findByText(
    'Remove the poll worker card once you have printed all necessary reports.'
  );
  apiMock.removeCard();
  await screen.findByText(/Insert Your Ballot/i);

  await scanBallot();

  // Close Polls
  apiMock.authenticateAsPollWorker(electionDefinition);
  await screen.findByText('Do you want to close the polls?');
  apiMock.expectClosePolls();
  apiMock.expectPrintReportV3();
  apiMock.expectGetPollsInfo('polls_closed_final');
  userEvent.click(await screen.findByText('Yes, Close the Polls'));
  await screen.findByText('Closing Polls…');
  await screen.findByText('Polls are closed.');
  await screen.findByText(
    'Remove the poll worker card once you have printed all necessary reports.'
  );

  apiMock.removeCard();
  await screen.findByText('Polls Closed');
});

test('poll worker can open, pause, unpause, and close poll without scanning any ballots', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo();
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatusV3({ connected: true });
  renderApp();
  await screen.findByText('Polls Closed');

  // Open Polls
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('Do you want to open the polls?');
  apiMock.expectOpenPolls();
  apiMock.expectPrintReportV3();
  apiMock.expectGetPollsInfo('polls_open');
  userEvent.click(await screen.findByText('Yes, Open the Polls'));
  await screen.findByText(
    'Remove the poll worker card once you have printed all necessary reports.'
  );
  apiMock.removeCard();
  await screen.findByText(/Insert Your Ballot/i);

  // Pause Voting Flow
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('Do you want to close the polls?');
  userEvent.click(await screen.findByText('No'));
  apiMock.expectPauseVoting();
  apiMock.expectPrintReportV3();
  apiMock.expectGetPollsInfo('polls_paused');
  userEvent.click(await screen.findByText('Pause Voting'));
  await screen.findByText('Pausing Voting…');
  await screen.findByText(
    'Remove the poll worker card once you have printed all necessary reports.'
  );
  apiMock.removeCard();
  await screen.findByText('Polls Paused');

  // Resume Voting Flow
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('Do you want to resume voting?');
  apiMock.expectResumeVoting();
  apiMock.expectPrintReportV3();
  apiMock.expectGetPollsInfo('polls_open', { type: 'resume_voting' });
  userEvent.click(await screen.findByText('Yes, Resume Voting'));
  await screen.findByText('Resuming Voting…');
  await screen.findByText(
    'Remove the poll worker card once you have printed all necessary reports.'
  );
  apiMock.removeCard();
  await screen.findByText(/Insert Your Ballot/i);

  // Close Polls Flow
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('Do you want to close the polls?');
  apiMock.expectClosePolls();
  apiMock.expectPrintReportV3();
  apiMock.expectGetPollsInfo('polls_closed_final');
  userEvent.click(await screen.findByText('Yes, Close the Polls'));
  await screen.findByText('Closing Polls…');
  await screen.findByText(
    'Remove the poll worker card once you have printed all necessary reports.'
  );
  apiMock.removeCard();
  await screen.findByText('Polls Closed');
});

test('system administrator can log in and unconfigure machine', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo();
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  renderApp();

  apiMock.authenticateAsSystemAdministrator();

  await screen.findByRole('heading', { name: 'System Administrator' });
  screen.getByRole('button', { name: 'Reboot to BIOS' });
  const unconfigureMachineButton = screen.getByRole('button', {
    name: 'Unconfigure Machine',
  });

  apiMock.mockApiClient.unconfigureElection.expectCallWith().resolves();
  apiMock.expectGetConfig({ electionDefinition: undefined });
  apiMock.expectGetPollsInfo();
  userEvent.click(unconfigureMachineButton);
  const modal = await screen.findByRole('alertdialog');
  userEvent.click(
    within(modal).getByRole('button', {
      name: 'Yes, Delete Election Data',
    })
  );
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

  apiMock.removeCard();
});

test('system administrator allowed to log in on unconfigured machine', async () => {
  apiMock.expectGetConfig({ electionDefinition: undefined });
  apiMock.expectGetPollsInfo();
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  renderApp();

  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: mockSystemAdministratorUser(),
  });
  await screen.findByText('Enter the card PIN');
});

test('system administrator sees system administrator screen after logging in to unconfigured machine', async () => {
  apiMock.expectGetConfig({ electionDefinition: undefined });
  apiMock.expectGetPollsInfo();
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.authenticateAsSystemAdministrator();
  renderApp();

  await screen.findByRole('heading', { name: 'System Administrator' });
});

test('system administrator sees log export button', async () => {
  apiMock.expectGetConfig({ electionDefinition: undefined });
  apiMock.expectGetPollsInfo();
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.authenticateAsSystemAdministrator();
  renderApp();

  await screen.findByRole('button', { name: 'Save Log File' });
});

test('system administrator can reset polls to paused', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_closed_final');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  renderApp();
  await screen.findByText('Polls Closed');

  apiMock.authenticateAsSystemAdministrator();

  userEvent.click(
    await screen.findByRole('button', { name: 'Reset Polls to Paused' })
  );
  const modal = await screen.findByRole('alertdialog');
  apiMock.expectResetPollsToPaused();
  apiMock.expectGetPollsInfo('polls_paused');
  userEvent.click(
    await within(modal).findByRole('button', { name: 'Reset Polls to Paused' })
  );
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  apiMock.removeCard();
  await screen.findByText('Polls Paused');
});

test('system administrator can set date and time', async () => {
  apiMock.expectGetConfig({ electionDefinition: undefined });
  apiMock.expectGetPollsInfo();
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.authenticateAsSystemAdministrator();
  renderApp();

  await screen.findByRole('button', { name: 'Set Date and Time' });
});

test('election manager cannot auth onto machine with different election', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo();
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  renderApp();

  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'wrong_election',
    cardUserRole: 'election_manager',
  });
  await screen.findByText('Invalid Card');
});

test('replace ballot bag flow', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  renderApp();
  await screen.findByText(/Insert Your Ballot/i);

  await scanBallot();

  // should go to modal after accepted screen
  apiMock.expectGetScannerStatus(
    scannerStatus({
      state: 'no_paper',
      ballotsCounted: BALLOT_BAG_CAPACITY,
    })
  );
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('Ballot Bag Full');

  // Insert a pollworker card to enter confirmation step
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await advanceTimersAndPromises(1);
  await screen.findByText('Ballot Bag Replaced?');

  // Removing card at this point returns to initial screen
  apiMock.removeCard();
  await advanceTimersAndPromises(1);
  await screen.findByText('Ballot Bag Full');

  // Can confirm with pollworker card
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await advanceTimersAndPromises(1);
  await screen.findByText('Ballot Bag Replaced?');
  userEvent.click(screen.getByText('Yes, New Ballot Bag is Ready'));

  // Prompted to remove card
  await advanceTimersAndPromises(1);
  await screen.findByText('Remove card to resume voting.');

  // Removing card returns to voter screen
  apiMock.mockApiClient.recordBallotBagReplaced.expectCallWith().resolves();
  apiMock.expectGetConfig({
    ballotCountWhenBallotBagLastReplaced: BALLOT_BAG_CAPACITY,
  });
  apiMock.removeCard();
  await advanceTimersAndPromises(3);
  await screen.findByText(/Insert Your Ballot/i);

  // Does not prompt again if new threshold hasn't been reached
  apiMock.expectGetScannerStatus(
    scannerStatus({
      state: 'no_paper',
      ballotsCounted: BALLOT_BAG_CAPACITY * 2 - 1,
    })
  );
  await advanceTimersAndPromises(1);
  await screen.findByText(/Insert Your Ballot/i);

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

test('renders VoterSettingsManager', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);

  renderApp();
  await screen.findByText(/insert your ballot/i);

  expect(mockOf(VoterSettingsManager)).toBeCalled();
});

test('requires CVR sync if necessary', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.expectGetUsbDriveStatus('mounted', {
    doesUsbDriveRequireCastVoteRecordSync: true,
  });
  apiMock.setPrinterStatusV3({ connected: true });
  renderApp();

  await screen.findByText(
    'A poll worker must sync cast vote records (CVRs) to the USB drive.'
  );

  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText(
    'The inserted USB drive does not contain up-to-date records of the votes cast at this scanner. ' +
      'Cast vote records (CVRs) need to be synced to the USB drive.'
  );

  apiMock.expectExportCastVoteRecordsToUsbDrive();
  userEvent.click(screen.getByRole('button', { name: 'Sync CVRs' }));
  const modal = await screen.findByRole('alertdialog');
  await within(modal).findByText('Syncing CVRs');
  await within(modal).findByText('Voters may continue casting ballots.');
  apiMock.expectGetUsbDriveStatus('mounted');

  userEvent.click(within(modal).getByRole('button', { name: 'Close' }));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  await screen.findByText('Do you want to close the polls?');
});

test('clears CVR sync required screen if no longer required', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.expectGetUsbDriveStatus('mounted', {
    doesUsbDriveRequireCastVoteRecordSync: true,
  });
  renderApp();

  await screen.findByText(
    'A poll worker must sync cast vote records (CVRs) to the USB drive.'
  );

  apiMock.expectGetUsbDriveStatus('mounted');
  await screen.findByText('Insert Your Ballot');
});

test('double feed detection calibration success', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_closed_initial');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatusV3({ connected: true });
  renderApp();

  apiMock.authenticateAsElectionManager(electionGeneralDefinition);
  userEvent.click(await screen.findByRole('tab', { name: 'System Settings' }));

  apiMock.mockApiClient.beginDoubleFeedCalibration.expectCallWith().resolves();
  userEvent.click(await screen.findButton('Calibrate Double Sheet Detection'));

  apiMock.expectGetScannerStatus({
    state: 'calibrating_double_feed_detection.double_sheet',
    ballotsCounted: 0,
  });
  await screen.findByRole('heading', {
    name: 'Double Sheet Detection Calibration',
  });
  screen.getByText('Insert Two Blank Sheets');

  // Removing the card shouldn't exit calibration - the only way out is through
  apiMock.removeCard();

  apiMock.expectGetScannerStatus({
    state: 'calibrating_double_feed_detection.single_sheet',
    ballotsCounted: 0,
  });
  await screen.findByText('Insert One Blank Sheet');

  apiMock.expectGetScannerStatus({
    state: 'calibrating_double_feed_detection.done',
    ballotsCounted: 0,
  });
  await screen.findByText('Calibration Complete');

  apiMock.mockApiClient.endDoubleFeedCalibration.expectCallWith().resolves();
  userEvent.click(await screen.findByRole('button', { name: 'Close' }));

  apiMock.expectGetScannerStatus({
    state: 'paused',
    ballotsCounted: 0,
  });
  await screen.findByRole('heading', { name: 'Polls Closed' });
});

test('double feed detection calibration failure', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_closed_initial');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatusV3({ connected: true });
  renderApp();

  apiMock.authenticateAsElectionManager(electionGeneralDefinition);
  userEvent.click(await screen.findByRole('tab', { name: 'System Settings' }));

  apiMock.mockApiClient.beginDoubleFeedCalibration.expectCallWith().resolves();
  userEvent.click(await screen.findButton('Calibrate Double Sheet Detection'));

  apiMock.expectGetScannerStatus({
    state: 'calibrating_double_feed_detection.double_sheet',
    ballotsCounted: 0,
  });
  await screen.findByRole('heading', {
    name: 'Double Sheet Detection Calibration',
  });
  screen.getByText('Insert Two Blank Sheets');

  apiMock.expectGetScannerStatus({
    state: 'calibrating_double_feed_detection.done',
    error: 'double_feed_calibration_timed_out',
    ballotsCounted: 0,
  });
  await screen.findByText('Calibration Failed');

  apiMock.mockApiClient.endDoubleFeedCalibration.expectCallWith().resolves();
  userEvent.click(await screen.findByRole('button', { name: 'Close' }));

  apiMock.expectGetScannerStatus({
    state: 'paused',
    ballotsCounted: 0,
  });
  await screen.findByRole('heading', { name: 'Election Manager Settings' });
});
