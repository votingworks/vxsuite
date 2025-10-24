import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import userEvent from '@testing-library/user-event';
import { mockSystemAdministratorUser } from '@votingworks/test-utils';
import {
  readElectionGeneralDefinition,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import {
  AdjudicationReason,
  ElectionPackageConfigurationError,
  SheetInterpretation,
  formatElectionHashes,
} from '@votingworks/types';
import { Result, deferred, err, ok } from '@votingworks/basics';

import type {
  PrecinctScannerConfig,
  PrecinctScannerStatus,
} from '@votingworks/scan-backend';
import { UsbDriveStatus } from '@votingworks/usb-drive';
import { waitFor, screen, within, render } from '../test/react_testing_library';
import { POLLING_INTERVAL_FOR_SCANNER_STATUS_MS } from './config/globals';
import { scannerStatus } from '../test/helpers/helpers';
import {
  ApiMock,
  createApiMock,
  statusNoPaper,
} from '../test/helpers/mock_api_client';
import { App, AppProps } from './app';
import { useSessionSettingsManager } from './utils/use_session_settings_manager';
import { DELAY_ACCEPTED_SCREEN_MS } from './screens/voter_screen';

const electionGeneralDefinition = readElectionGeneralDefinition();
const electionGeneral = electionGeneralDefinition.election;
const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();

vi.mock('./utils/use_session_settings_manager');

let apiMock: ApiMock;
const startNewSessionMock = vi.fn();
const pauseSessionMock = vi.fn();
const resumeSessionMock = vi.fn();

function renderApp(props: Partial<AppProps> = {}) {
  render(<App apiClient={apiMock.mockApiClient} noAudio {...props} />);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.removeCard(); // Set a default auth state of no card inserted.
  vi.mocked(useSessionSettingsManager).mockReturnValue({
    startNewSession: startNewSessionMock,
    pauseSession: pauseSessionMock,
    resumeSession: resumeSessionMock,
  });
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('shows setup card reader screen when there is no card reader', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_closed_initial');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatus();
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
  apiMock.setPrinterStatus();
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
  apiMock.setPrinterStatus();
  renderApp();
  await screen.findByText(
    'Insert an election manager card to configure VxScan'
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
    'No signed election package found on the inserted USB drive. Save a signed election package in VxAdmin.'
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

  await screen.findByText('Election Manager Menu');
  screen.getByText(electionGeneral.title);
  screen.getByText(
    formatElectionHashes(
      electionGeneralDefinition.ballotHash,
      'test-election-package-hash'
    )
  );

  // Select precinct
  const precinct = electionGeneral.precincts[0];
  apiMock.expectSetPrecinct(singlePrecinctSelectionFor(precinct.id));
  apiMock.expectGetConfig({
    precinctSelection: singlePrecinctSelectionFor(precinct.id),
  });
  apiMock.expectGetPollsInfo('polls_closed_initial');
  userEvent.click(screen.getByLabelText('Select a precinct…'));
  userEvent.click(screen.getByText(precinct.name));
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
  apiMock.setPrinterStatus();
  renderApp();
  await screen.findByText('No Precinct Selected');

  // Poll worker card does nothing
  apiMock.expectGetQuickResultsReportingUrl();
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('No Precinct Selected');
  apiMock.removeCard();

  // Insert election manager card and set precinct
  apiMock.authenticateAsElectionManager(electionGeneralDefinition);
  await screen.findByText('Election Manager Menu');
  const precinct = electionGeneral.precincts[0];
  apiMock.expectSetPrecinct(singlePrecinctSelectionFor(precinct.id));
  apiMock.expectGetConfig({
    precinctSelection: singlePrecinctSelectionFor(precinct.id),
  });
  apiMock.expectGetPollsInfo('polls_closed_initial');
  userEvent.click(screen.getByLabelText('Select a precinct…'));
  userEvent.click(screen.getByText(precinct.name));
  apiMock.removeCard();
  // Confirm precinct is set and correct
  await screen.findByText('Polls Closed');
  screen.getByText('Center Springfield');

  // Poll worker card can be used to open polls now
  apiMock.expectGetQuickResultsReportingUrl();
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
  apiMock.setPrinterStatus();
  renderApp();
  await screen.findByText('Polls Closed');

  // Change mode as election manager
  apiMock.authenticateAsElectionManager(electionDefinition);
  await screen.findByText('Election Manager Menu');

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

  // Change precinct as election manager
  const precinct = electionDefinition.election.precincts[0];
  const precinctSelection = singlePrecinctSelectionFor(precinct.id);
  apiMock.expectSetPrecinct(precinctSelection);
  config = { ...config, precinctSelection };
  apiMock.expectGetConfig(config);
  apiMock.expectGetPollsInfo('polls_closed_initial');
  userEvent.click(screen.getByLabelText('Select a precinct…'));
  userEvent.click(screen.getByText(precinct.name));
  apiMock.removeCard();

  // Open the polls
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.expectOpenPolls();
  apiMock.expectPrintReportSection(0).resolve();
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.expectGetQuickResultsReportingUrl();
  apiMock.authenticateAsPollWorker(electionDefinition);
  userEvent.click(await screen.findByText('Open Polls'));
  await screen.findByText(
    /Remove the poll worker card once you have printed all necessary reports/
  );
  apiMock.removeCard();

  // Change precinct as election manager with polls open
  const otherPrecinct = electionDefinition.election.precincts[1];
  apiMock.expectSetPrecinct(singlePrecinctSelectionFor(otherPrecinct.id));
  config = {
    ...config,
    precinctSelection: singlePrecinctSelectionFor(otherPrecinct.id),
  };
  apiMock.expectGetConfig(config);
  apiMock.expectGetPollsInfo('polls_closed_initial');
  apiMock.authenticateAsElectionManager(electionDefinition);
  await screen.findByText('Election Manager Menu');
  userEvent.click(screen.getByText('Change Precinct'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Change Precinct' });
  userEvent.click(within(modal).getByText(precinct.name));
  userEvent.click(within(modal).getByText(otherPrecinct.name));
  userEvent.click(within(modal).getButton('Confirm'));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  apiMock.removeCard();
  await screen.findByText('Polls Closed');
  await screen.findByText(otherPrecinct.name);

  // Open the polls again
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.expectOpenPolls();
  apiMock.expectPrintReportSection(0).resolve();
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.expectGetQuickResultsReportingUrl();
  apiMock.authenticateAsPollWorker(electionDefinition);
  await screen.findByText('Do you want to open the polls?');
  userEvent.click(await screen.findByText('Open Polls'));

  await screen.findByText(
    /Remove the poll worker card once you have printed all necessary reports/
  );
  apiMock.removeCard();

  // Remove card and insert election manager card to unconfigure
  apiMock.expectGetScannerStatus({
    ...statusNoPaper,
    ballotsCounted: 1,
  });
  apiMock.authenticateAsElectionManager(electionDefinition);
  await screen.findByText('Election Manager Menu');
  screen.getButton('Change Precinct');

  userEvent.click(await screen.findByText('Unconfigure Machine'));
  userEvent.click(await screen.findByText('Cancel'));

  // Actually unconfigure
  apiMock.mockApiClient.unconfigureElection.expectCallWith().resolves();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetConfig({ electionDefinition: undefined });
  apiMock.expectGetPollsInfo();
  apiMock.mockApiClient.ejectUsbDrive.expectCallWith().resolves();
  apiMock.expectGetUsbDriveStatus('ejected');
  userEvent.click(await screen.findByText('Unconfigure Machine'));
  userEvent.click(await screen.findByText('Delete All Election Data'));
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
  vi.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Please wait/);

  apiMock.expectGetScannerStatus(scannerStatus({ state: 'scanning' }));
  vi.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);

  apiMock.expectGetScannerStatus(scannerStatus({ state: 'accepting' }));
  vi.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);

  apiMock.expectGetScannerStatus(scannerStatus({ state: 'accepted' }));
  apiMock.expectPlaySound('success');
  apiMock.mockApiClient.readyForNextBallot.expectCallWith().resolves();
  vi.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('Your ballot was counted!');

  apiMock.expectGetScannerStatus(statusBallotCounted);
  vi.advanceTimersByTime(DELAY_ACCEPTED_SCREEN_MS);
  await screen.findByText(/Insert Your Ballot/i);
  expect(screen.getByTestId('ballot-count').textContent).toEqual('1');
}

test('voter can cast a ballot that scans successfully', async () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  apiMock.expectGetConfig({
    electionDefinition,
  });
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatus();
  renderApp();
  await screen.findByText(/Insert Your Ballot/i);
  screen.getByText('Scan one ballot sheet at a time.');
  screen.getByText('Example Primary Election');
  screen.getByText(/Sample County/);
  screen.getByText(/State of Sample/);
  screen.getByText('Election ID');
  within(screen.getByText('Election ID').parentElement!).getByText(
    formatElectionHashes(
      electionDefinition.ballotHash,
      'test-election-package-hash'
    )
  );

  await scanBallot();

  // Insert a pollworker card
  apiMock.expectGetScannerStatus(statusBallotCounted);
  apiMock.expectGetQuickResultsReportingUrl();
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('Do you want to close the polls?');

  // Close Polls
  apiMock.expectClosePolls();
  apiMock.expectPrintReportSection(0).resolve();
  apiMock.expectGetPollsInfo('polls_closed_final');
  userEvent.click(await screen.findByText('Close Polls'));
  await screen.findByText('Closing Polls…');
  await screen.findByText('Polls Closed');

  // Simulate unmounted usb drive
  apiMock.expectGetUsbDriveStatus('ejected');
  // Remove the usb drive
  apiMock.expectGetUsbDriveStatus('no_drive');

  // Remove pollworker card
  apiMock.removeCard();

  // Insert election manager card
  apiMock.authenticateAsElectionManager(electionGeneralDefinition);
  await screen.findByText('Election Manager Menu');

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

  apiMock.expectExportCastVoteRecordsToUsbDrive({ mode: 'full_export' });
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
  apiMock.setPrinterStatus();
  renderApp();
  await screen.findByText(/Insert Your Ballot/i);

  const interpretation: SheetInterpretation = {
    type: 'NeedsReviewSheet',
    reasons: [{ type: AdjudicationReason.BlankBallot }],
  };
  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'hardware_ready_to_scan' })
  );
  vi.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Please wait/);

  apiMock.expectGetScannerStatus(scannerStatus({ state: 'scanning' }));
  vi.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);

  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'needs_review', interpretation })
  );
  apiMock.expectPlaySound('warning');
  vi.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('No votes were found when scanning this ballot.');
  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot' }));
  await screen.findByText('Confirm Your Votes');

  apiMock.mockApiClient.acceptBallot.expectCallWith().resolves();
  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'accepting_after_review', interpretation })
  );
  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'accepted', interpretation })
  );
  apiMock.expectPlaySound('success');
  apiMock.mockApiClient.readyForNextBallot.expectCallWith().resolves();
  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot' }));
  await screen.findByText('Your ballot was counted!');

  vi.advanceTimersByTime(DELAY_ACCEPTED_SCREEN_MS);
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
  apiMock.setPrinterStatus();
  renderApp();
  await screen.findByText(/Insert Your Ballot/i);

  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'hardware_ready_to_scan' })
  );
  vi.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
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
  vi.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('Wrong Election');
  screen.getByText(
    'The scanner is configured for an election that does not match the ballot.'
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
  apiMock.expectPlaySound('success');
  apiMock.mockApiClient.readyForNextBallot.expectCallWith().resolves();
  apiMock.setPrinterStatus();
  renderApp();
  await screen.findByText('Your ballot was counted!');
  expect(screen.getByTestId('ballot-count').textContent).toEqual('1');

  apiMock.expectGetScannerStatus(scannerStatus({ state: 'scanning' }));
  vi.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Please wait/);

  apiMock.expectGetScannerStatus(
    scannerStatus({
      state: 'needs_review',
      interpretation: {
        type: 'NeedsReviewSheet',
        reasons: [{ type: AdjudicationReason.BlankBallot }],
      },
    })
  );
  apiMock.expectPlaySound('warning');
  vi.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('No votes were found when scanning this ballot.');
});

test('scanning is not triggered when polls closed or cards present', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_closed_initial');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'hardware_ready_to_scan' })
  );
  apiMock.setPrinterStatus();
  renderApp();
  await screen.findByText('Polls Closed');
  apiMock.expectGetQuickResultsReportingUrl();
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('Do you want to open the polls?');
  // Open Polls
  apiMock.expectOpenPolls();
  apiMock.expectPrintReportSection(0).resolve();
  apiMock.expectGetPollsInfo('polls_open');
  userEvent.click(screen.getByText('Open Polls'));
  await screen.findByText('Polls Opened');

  // Once we remove the poll worker card, scanning should start
  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'hardware_ready_to_scan' })
  );
  apiMock.removeCard();
  vi.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Please wait/);
});

test('poll worker can open and close polls without scanning any ballots', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetQuickResultsReportingUrl();
  apiMock.expectGetPollsInfo('polls_closed_initial');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatus();
  renderApp();
  await screen.findByText('Polls Closed');

  // Open Polls Flow
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('Do you want to open the polls?');
  apiMock.expectOpenPolls();
  apiMock.expectPrintReportSection(0).resolve();
  apiMock.expectGetPollsInfo('polls_open');
  userEvent.click(screen.getByRole('button', { name: 'Open Polls' }));
  await screen.findByText('Polls Opened');
  apiMock.expectPrintReportSection(0).resolve();
  userEvent.click(
    screen.getByRole('button', { name: 'Reprint Polls Opened Report' })
  );
  await screen.findByText('Printing Report…');
  await screen.findByText('Polls Opened');
  screen.getByRole('button', { name: 'Reprint Polls Opened Report' });
  screen.getByText('Remove the poll worker card', { exact: false });
  apiMock.removeCard();
  await screen.findByText(/Insert Your Ballot/i);

  // Close Polls Flow
  apiMock.expectGetQuickResultsReportingUrl();
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('Do you want to close the polls?');
  apiMock.expectClosePolls();
  apiMock.expectPrintReportSection(0).resolve();
  apiMock.expectGetPollsInfo('polls_closed_final');
  userEvent.click(screen.getByRole('button', { name: 'Close Polls' }));
  await screen.findByText('Polls Closed');
  apiMock.expectPrintReportSection(0).resolve();
  userEvent.click(
    screen.getByRole('button', { name: 'Reprint Polls Closed Report' })
  );
  await screen.findByText('Printing Report…');
  await screen.findByText('Polls Closed');
  screen.getByRole('button', { name: 'Reprint Polls Closed Report' });
  screen.getByText('Remove the poll worker card', { exact: false });
  apiMock.removeCard();
  await screen.findByText('Polls Closed');
});

test('open polls, scan ballot, close polls, save results', async () => {
  const electionDefinition = electionGeneralDefinition;
  apiMock.expectGetConfig({
    electionDefinition,
  });
  apiMock.expectGetPollsInfo();
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatus();
  renderApp();
  await screen.findByText('Polls Closed');
  // Open Polls Flow
  apiMock.expectGetQuickResultsReportingUrl();
  apiMock.authenticateAsPollWorker(electionDefinition);
  await screen.findByText('Do you want to open the polls?');
  apiMock.expectOpenPolls();
  apiMock.expectPrintReportSection(0).resolve();
  apiMock.expectGetPollsInfo('polls_open');
  userEvent.click(await screen.findByText('Open Polls'));
  await screen.findByText(
    /Remove the poll worker card once you have printed all necessary reports/
  );
  apiMock.removeCard();
  await screen.findByText(/Insert Your Ballot/i);

  await scanBallot();

  // Close Polls
  apiMock.expectGetQuickResultsReportingUrl();
  apiMock.authenticateAsPollWorker(electionDefinition);
  await screen.findByText('Do you want to close the polls?');
  apiMock.expectClosePolls();
  apiMock.expectPrintReportSection(0).resolve();
  apiMock.expectGetPollsInfo('polls_closed_final');
  userEvent.click(await screen.findByText('Close Polls'));
  await screen.findByText('Closing Polls…');
  await screen.findByText('Polls Closed');
  await screen.findByText(
    /Remove the poll worker card once you have printed all necessary reports/
  );

  apiMock.removeCard();
  await screen.findByText('Polls Closed');
});

test('poll worker can open, pause, unpause, and close poll without scanning any ballots', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo();
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatus();
  renderApp();
  await screen.findByText('Polls Closed');

  // Open Polls
  apiMock.expectGetQuickResultsReportingUrl();
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('Do you want to open the polls?');
  apiMock.expectOpenPolls();
  apiMock.expectPrintReportSection(0).resolve();
  apiMock.expectGetPollsInfo('polls_open');
  userEvent.click(await screen.findByText('Open Polls'));
  await screen.findByText(
    /Remove the poll worker card once you have printed all necessary reports/
  );
  apiMock.removeCard();
  await screen.findByText(/Insert Your Ballot/i);

  // Pause Voting Flow
  apiMock.expectGetQuickResultsReportingUrl();
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('Do you want to close the polls?');
  userEvent.click(await screen.findByText('Menu'));
  apiMock.expectPauseVoting();
  apiMock.expectPrintReportSection(0).resolve();
  apiMock.expectGetPollsInfo('polls_paused');
  userEvent.click(await screen.findByText('Pause Voting'));
  await screen.findByText('Pausing Voting…');
  await screen.findByText(
    /Remove the poll worker card once you have printed all necessary reports/
  );
  apiMock.removeCard();
  await screen.findByText('Voting Paused');

  // Resume Voting Flow
  apiMock.expectGetQuickResultsReportingUrl();
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('Do you want to resume voting?');
  apiMock.expectResumeVoting();
  apiMock.expectPrintReportSection(0).resolve();
  apiMock.expectGetPollsInfo('polls_open', { type: 'resume_voting' });
  userEvent.click(await screen.findByText('Resume Voting'));
  await screen.findByText('Resuming Voting…');
  await screen.findByText(
    /Remove the poll worker card once you have printed all necessary reports/
  );
  apiMock.removeCard();
  await screen.findByText(/Insert Your Ballot/i);

  // Close Polls Flow
  apiMock.expectGetQuickResultsReportingUrl();
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('Do you want to close the polls?');
  apiMock.expectClosePolls();
  apiMock.expectPrintReportSection(0).resolve();
  apiMock.expectGetPollsInfo('polls_closed_final');
  userEvent.click(await screen.findByText('Close Polls'));
  await screen.findByText('Closing Polls…');
  await screen.findByText(
    /Remove the poll worker card once you have printed all necessary reports/
  );
  apiMock.removeCard();
  await screen.findByText('Polls Closed');
});

test('ballot mode banner consistently displayed in voter screens', async () => {
  const electionDefinition = electionGeneralDefinition;
  apiMock.expectGetConfig({
    electionDefinition,
    isTestMode: true,
  });
  apiMock.expectGetPollsInfo();
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatus();
  renderApp();

  // banner before polls opened
  await screen.findByText('Polls Closed');
  screen.getByText('Test Ballot Mode');

  // open polls
  apiMock.expectGetQuickResultsReportingUrl();
  apiMock.authenticateAsPollWorker(electionDefinition);
  await screen.findByText('Do you want to open the polls?');
  apiMock.expectOpenPolls();
  apiMock.expectPrintReportSection(0).resolve();
  apiMock.expectGetPollsInfo('polls_open');
  userEvent.click(await screen.findByText('Open Polls'));
  await screen.findByText('Polls Opened');
  apiMock.removeCard();

  // banner when open
  await screen.findByText(/Insert Your Ballot/i);
  screen.getByText('Test Ballot Mode');

  // banner while scanning
  apiMock.expectGetScannerStatus(
    scannerStatus({ state: 'hardware_ready_to_scan' })
  );
  vi.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Please wait/);
  screen.getByText('Test Ballot Mode');

  apiMock.expectGetScannerStatus(scannerStatus({ state: 'scanning' }));
  vi.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);

  apiMock.expectGetScannerStatus(scannerStatus({ state: 'accepting' }));
  vi.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);

  // banner after successful scan
  apiMock.mockApiClient.readyForNextBallot.expectCallWith().resolves();
  apiMock.expectGetScannerStatus(scannerStatus({ state: 'accepted' }));
  apiMock.expectPlaySound('success');
  vi.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('Your ballot was counted!');
  screen.getByText('Test Ballot Mode');

  apiMock.expectGetScannerStatus(statusBallotCounted);
  vi.advanceTimersByTime(DELAY_ACCEPTED_SCREEN_MS);
  await screen.findByText(/Insert Your Ballot/i);

  // close polls
  apiMock.expectGetQuickResultsReportingUrl();
  apiMock.authenticateAsPollWorker(electionDefinition);
  await screen.findByText('Do you want to close the polls?');
  apiMock.expectClosePolls();
  apiMock.expectPrintReportSection(0).resolve();
  apiMock.expectGetPollsInfo('polls_closed_final');
  userEvent.click(await screen.findByText('Close Polls'));
  await screen.findByText('Closing Polls…');
  await screen.findByText('Polls Closed');
  apiMock.removeCard();

  // banner after polls closed
  await screen.findByText('Voting is complete.');
  screen.getByText('Test Ballot Mode');
});

test('system administrator can log in and unconfigure machine', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo();
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatus();
  renderApp();

  apiMock.authenticateAsSystemAdministrator();

  await screen.findByRole('heading', { name: 'System Administrator Menu' });
  screen.getByRole('button', { name: 'Power Down' });
  const unconfigureMachineButton = screen.getByRole('button', {
    name: 'Unconfigure Machine',
  });

  apiMock.mockApiClient.unconfigureElection.expectCallWith().resolves();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetConfig({ electionDefinition: undefined });
  apiMock.expectGetPollsInfo();
  userEvent.click(unconfigureMachineButton);
  const modal = await screen.findByRole('alertdialog');
  userEvent.click(
    within(modal).getByRole('button', {
      name: 'Delete All Election Data',
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
  apiMock.setPrinterStatus();
  renderApp();

  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: mockSystemAdministratorUser(),
  });
  await screen.findByText('Enter Card PIN');
});

test('system administrator sees system administrator screen after logging in to unconfigured machine', async () => {
  apiMock.expectGetConfig({ electionDefinition: undefined });
  apiMock.expectGetPollsInfo();
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatus();
  apiMock.authenticateAsSystemAdministrator();
  renderApp();

  await screen.findByRole('heading', { name: 'System Administrator Menu' });
});

test('system administrator sees log export button', async () => {
  apiMock.expectGetConfig({ electionDefinition: undefined });
  apiMock.expectGetPollsInfo();
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatus();
  apiMock.authenticateAsSystemAdministrator();
  renderApp();

  await screen.findByRole('button', { name: 'Save Logs' });
});

test('system administrator can reset polls to paused', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_closed_final');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatus();
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
  await screen.findByText('Voting Paused');
});

test('system administrator can set date and time', async () => {
  apiMock.expectGetConfig({ electionDefinition: undefined });
  apiMock.expectGetPollsInfo();
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.authenticateAsSystemAdministrator();
  apiMock.setPrinterStatus();
  renderApp();

  await screen.findByRole('button', { name: 'Set Date and Time' });
});

test('system administrator open diagnostics screen', async () => {
  apiMock.expectGetConfig({ electionDefinition: undefined });
  apiMock.expectGetPollsInfo();
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatus();

  apiMock.expectGetDiskSpaceSummary();
  apiMock.expectGetMostRecentScannerDiagnostic();
  apiMock.expectGetMostRecentPrinterDiagnostic();
  apiMock.expectGetMostRecentAudioDiagnostic();
  apiMock.expectGetMostRecentUpsDiagnostic();
  renderApp();

  apiMock.authenticateAsSystemAdministrator();

  userEvent.click(await screen.findButton('Diagnostics'));
});

test('election manager cannot auth onto machine with different election', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo();
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatus();
  renderApp();

  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'wrong_election',
    cardUserRole: 'election_manager',
  });
  await screen.findByText('Invalid Card');
});

test('requires CVR sync if necessary', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.expectGetUsbDriveStatus('mounted', {
    doesUsbDriveRequireCastVoteRecordSync: true,
  });
  apiMock.setPrinterStatus();
  renderApp();

  await screen.findByText(
    'A poll worker must sync cast vote records (CVRs) to the USB drive.'
  );

  apiMock.expectGetQuickResultsReportingUrl();
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText(
    'The inserted USB drive does not contain up-to-date records of the votes cast at this scanner. ' +
      'Cast vote records (CVRs) need to be synced to the USB drive.'
  );

  apiMock.expectExportCastVoteRecordsToUsbDrive({ mode: 'recovery_export' });
  userEvent.click(screen.getByRole('button', { name: 'Sync CVRs' }));
  const modal = await screen.findByRole('alertdialog');
  await within(modal).findByText('CVR Sync Complete');
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
  apiMock.setPrinterStatus();
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
  apiMock.setPrinterStatus();
  renderApp();

  apiMock.authenticateAsElectionManager(electionGeneralDefinition);
  userEvent.click(await screen.findByRole('tab', { name: 'Scanner' }));

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
  apiMock.setPrinterStatus();
  renderApp();

  apiMock.authenticateAsElectionManager(electionGeneralDefinition);
  userEvent.click(await screen.findByRole('tab', { name: 'Scanner' }));

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
  await screen.findByText('Calibration Timed Out');

  apiMock.expectGetScannerStatus({
    state: 'calibrating_double_feed_detection.done',
    error: 'unexpected_event',
    ballotsCounted: 0,
  });
  await screen.findByText('Calibration Failed');

  apiMock.mockApiClient.endDoubleFeedCalibration.expectCallWith().resolves();
  userEvent.click(await screen.findByRole('button', { name: 'Close' }));

  apiMock.expectGetScannerStatus({
    state: 'paused',
    ballotsCounted: 0,
  });
  await screen.findByRole('heading', { name: 'Election Manager Menu' });
});

test('image sensor calibration success', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_closed_initial');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatus();
  renderApp();

  apiMock.authenticateAsSystemAdministrator();

  apiMock.mockApiClient.beginImageSensorCalibration.expectCallWith().resolves();
  userEvent.click(await screen.findButton('Calibrate Image Sensors'));

  apiMock.expectGetScannerStatus({
    state: 'calibrating_image_sensors.calibrating',
    ballotsCounted: 0,
  });
  await screen.findByRole('heading', {
    name: 'Image Sensor Calibration',
  });
  screen.getByText('Insert One Blank Sheet');

  // Removing the card shouldn't exit calibration - the only way out is through
  apiMock.removeCard();

  apiMock.expectGetScannerStatus({
    state: 'calibrating_image_sensors.done',
    ballotsCounted: 0,
  });
  await screen.findByText('Calibration Complete');

  apiMock.mockApiClient.endImageSensorCalibration.expectCallWith().resolves();
  userEvent.click(await screen.findByRole('button', { name: 'Close' }));

  apiMock.expectGetScannerStatus({
    state: 'paused',
    ballotsCounted: 0,
  });
  await screen.findByRole('heading', { name: 'Polls Closed' });
});

test('image sensor calibration failure', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_closed_initial');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatus();
  renderApp();

  apiMock.authenticateAsSystemAdministrator();

  apiMock.mockApiClient.beginImageSensorCalibration.expectCallWith().resolves();
  userEvent.click(await screen.findButton('Calibrate Image Sensors'));

  apiMock.expectGetScannerStatus({
    state: 'calibrating_image_sensors.calibrating',
    ballotsCounted: 0,
  });
  await screen.findByRole('heading', {
    name: 'Image Sensor Calibration',
  });
  screen.getByText('Insert One Blank Sheet');

  apiMock.expectGetScannerStatus({
    state: 'calibrating_image_sensors.done',
    error: 'image_sensor_calibration_timed_out',
    ballotsCounted: 0,
  });
  await screen.findByText('Calibration Timed Out');

  apiMock.expectGetScannerStatus({
    state: 'calibrating_image_sensors.done',
    error: 'unexpected_event',
    ballotsCounted: 0,
  });
  await screen.findByText('Calibration Failed');

  apiMock.mockApiClient.endImageSensorCalibration.expectCallWith().resolves();
  userEvent.click(await screen.findByRole('button', { name: 'Close' }));

  apiMock.expectGetScannerStatus({
    state: 'paused',
    ballotsCounted: 0,
  });
  await screen.findByRole('heading', { name: 'System Administrator Menu' });
});

test('"Test" voter settings are cleared when a voter finishes', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.setPrinterStatus();
  apiMock.expectGetScannerStatus(scannerStatus({ state: 'accepted' }));
  apiMock.expectPlaySound('success');
  apiMock.mockApiClient.readyForNextBallot.expectCallWith().resolves();

  renderApp();
  await screen.findByText('Your ballot was counted!');

  apiMock.expectGetScannerStatus(statusBallotCounted);
  vi.advanceTimersByTime(DELAY_ACCEPTED_SCREEN_MS);
  await screen.findByText(/Insert Your Ballot/i);

  expect(startNewSessionMock).toBeCalled();
  expect(resumeSessionMock).not.toBeCalled();
  expect(pauseSessionMock).not.toBeCalled();
});

test('"Test" voter settings are cached when election official logs in and restored on log out', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatus();

  renderApp();
  await screen.findByText(/Insert Your Ballot/i);

  // Auth as Election Manager
  apiMock.authenticateAsElectionManager(electionGeneralDefinition);
  await screen.findByText('Election Manager Menu');
  expect(pauseSessionMock).toBeCalled();

  // Return to voter screen
  apiMock.removeCard();
  await screen.findByText(/Insert Your Ballot/i);
  expect(resumeSessionMock).toBeCalled();
  expect(startNewSessionMock).not.toBeCalled();
});

test('"Test" voter settings are not reset when scanner status changes from paused to no_paper', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.setPrinterStatus();
  apiMock.expectGetScannerStatus(scannerStatus({ state: 'paused' }));
  renderApp();
  await screen.findByText('Sheets Scanned');

  apiMock.expectGetScannerStatus(statusNoPaper);
  vi.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);

  await screen.findByText(/Insert Your Ballot/i);

  expect(startNewSessionMock).not.toBeCalled();
  expect(resumeSessionMock).not.toBeCalled();
  expect(pauseSessionMock).not.toBeCalled();
});

test('"Test" voter settings are not reset when voting begins', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.setPrinterStatus();
  apiMock.expectGetScannerStatus(statusNoPaper);

  renderApp();
  await screen.findByText(/Insert Your Ballot/i);

  expect(startNewSessionMock).not.toBeCalled();
});

test.each<{
  description: string;
  scannerStatus: PrecinctScannerStatus;
  usbDriveStatus: UsbDriveStatus['status'];
  doesAccessibilityInputDisconnect: boolean;
  expectedHeading: string;
}>([
  {
    description: 'USB drive removed',
    scannerStatus: statusNoPaper,
    usbDriveStatus: 'no_drive',
    doesAccessibilityInputDisconnect: false,
    expectedHeading: 'No USB Drive Detected',
  },
  {
    description: 'scanner cover opened',
    scannerStatus: { ballotsCounted: 0, state: 'cover_open' },
    usbDriveStatus: 'mounted',
    doesAccessibilityInputDisconnect: false,
    expectedHeading: 'Scanner Cover is Open',
  },
  {
    description: 'accessibility input disconnected',
    scannerStatus: statusNoPaper,
    usbDriveStatus: 'mounted',
    doesAccessibilityInputDisconnect: true,
    expectedHeading: 'Accessibility Input Disconnected',
  },
])('alarms - $description', async (testConfig) => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.expectGetScannerStatus(testConfig.scannerStatus);
  apiMock.expectGetUsbDriveStatus(testConfig.usbDriveStatus, {
    isAccessibilityInputConnected: true,
  });
  apiMock.setPrinterStatus();

  apiMock.expectPlaySoundRepeated('alarm');

  renderApp();

  if (testConfig.doesAccessibilityInputDisconnect) {
    apiMock.expectGetUsbDriveStatus(testConfig.usbDriveStatus, {
      isAccessibilityInputConnected: undefined,
    });
  }

  await screen.findByText(testConfig.expectedHeading);
  vi.advanceTimersByTime(5000);

  const settingsButton = await screen.findByRole('button', {
    name: 'Settings',
  });
  expect(settingsButton).toBeDisabled();

  await waitFor(() => apiMock.mockApiClient.playSound.assertComplete());
  // Clear the mock to check that no further sounds are played once we authenticate as a poll
  // worker
  apiMock.mockApiClient.playSound.reset();

  apiMock.expectGetQuickResultsReportingUrl();
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('Close Polls');
  vi.advanceTimersByTime(5000);
});
