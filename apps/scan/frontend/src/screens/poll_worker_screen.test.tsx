import {
  vi,
  beforeEach,
  afterEach,
  describe,
  test,
  expect,
  Mock,
} from 'vitest';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import userEvent from '@testing-library/user-event';
import { waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import {
  electionFamousNames2021Fixtures,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { err } from '@votingworks/basics';
import { DEFAULT_SYSTEM_SETTINGS, PollsState } from '@votingworks/types';
import { screen, render } from '../../test/react_testing_library.js';
import { PollWorkerScreen, PollWorkerScreenProps } from './poll_worker_screen.js';
import {
  ApiMock,
  createApiMock,
  provideApi,
  statusNoPaper,
} from '../../test/helpers/mock_api_client.js';

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();

let apiMock: ApiMock;
let startNewVoterSessionMock: Mock;

const featureFlagMock = getFeatureFlagMock();

vi.mock('@votingworks/utils', async () => ({
  ...(await vi.importActual('@votingworks/utils')),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

beforeEach(() => {
  featureFlagMock.resetFeatureFlags();
  startNewVoterSessionMock = vi.fn();
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetConfig();
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.setPrinterStatus();
  apiMock.expectGetQuickResultsReportingUrl([]);
});

afterEach(() => {
  window.kiosk = undefined;
  apiMock.mockApiClient.assertComplete();
});

function renderScreen(props: Partial<PollWorkerScreenProps> = {}) {
  return render(
    provideApi(
      apiMock,
      <PollWorkerScreen
        electionDefinition={electionFamousNames2021Fixtures.readElectionDefinition()}
        startNewVoterSession={startNewVoterSessionMock}
        scannedBallotCount={0}
        {...props}
      />
    )
  );
}

describe('transitions from polls closed initial', () => {
  beforeEach(async () => {
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.expectGetQuickResultsReportingUrl([]);
    renderScreen({
      scannedBallotCount: 0,
    });
    await screen.findByText('Do you want to open the polls?');
  });

  test('open polls happy path', async () => {
    apiMock.expectOpenPolls();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_open');
    userEvent.click(screen.getByText('Open Polls'));
    await screen.findByText('Opening Polls…');
    await screen.findByText('Polls Opened');
    await screen.findByText('Reprint Polls Opened Report');
    expect(screen.queryByText('Send Polls Opened Report')).toBeNull();
  });

  test('open polls from landing screen', async () => {
    apiMock.expectOpenPolls();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_open');
    userEvent.click(screen.getByText('Menu'));
    userEvent.click(await screen.findByText('Open Polls'));
    await screen.findByText('Opening Polls…');
    await screen.findByText('Polls Opened');
    await screen.findByText('Reprint Polls Opened Report');
    expect(screen.queryByText('Send Polls Opened Report')).toBeNull();
  });

  test('open polls happy path with vxqr', async () => {
    apiMock.expectOpenPolls();
    apiMock.expectGetQuickResultsReportingUrl(['https://example.com/qr']);
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_open');
    userEvent.click(screen.getByText('Open Polls'));
    await screen.findByText('Opening Polls…');
    await screen.findByText('Polls Opened');
    await screen.findByText('Reprint Polls Opened Report');
    userEvent.click(screen.getButton('Send Polls Opened Report'));
    const qrCode = screen.getByTestId('quick-results-code');
    expect(qrCode).toBeInTheDocument();
    userEvent.click(screen.getButton('Done'));
    await screen.findByText('Close Polls');
  });
});

describe('transitions from polls open', () => {
  beforeEach(async () => {
    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({
      scannedBallotCount: 7,
    });
    await screen.findByText('Do you want to close the polls?');
  });

  test('close polls happy path', async () => {
    apiMock.expectClosePolls();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getByText('Close Polls'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls Closed');
    expect(startNewVoterSessionMock).toHaveBeenCalledTimes(1);
    await screen.findByText('Reprint Polls Closed Report');
    expect(screen.queryByText('Send Polls Closed Report')).toBeNull();
  });

  test('close polls from landing screen', async () => {
    apiMock.expectClosePolls();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getByText('Menu'));
    userEvent.click(await screen.findByText('Close Polls'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls Closed');
    expect(startNewVoterSessionMock).toHaveBeenCalledTimes(1);
    await screen.findByText('Reprint Polls Closed Report');
    expect(screen.queryByText('Send Polls Closed Report')).toBeNull();
  });

  test('close polls happy path with vxqr', async () => {
    apiMock.expectClosePolls();
    apiMock.expectGetQuickResultsReportingUrl(['https://example.com/qr']);
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getByText('Close Polls'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls Closed');
    expect(startNewVoterSessionMock).toHaveBeenCalledTimes(1);
    await screen.findByText('Reprint Polls Closed Report');
    userEvent.click(screen.getButton('Send Polls Closed Report'));
    const qrCode = screen.getByTestId('quick-results-code');
    expect(qrCode).toBeInTheDocument();
    userEvent.click(screen.getButton('Done'));
  });

  test('close polls happy path with multi-page vxqr', async () => {
    apiMock.expectClosePolls();
    apiMock.expectGetQuickResultsReportingUrl([
      'https://example.com/qr1',
      'https://example.com/qr2',
    ]);
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getByText('Close Polls'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls Closed');
    expect(startNewVoterSessionMock).toHaveBeenCalledTimes(1);
    await screen.findByText('Reprint Polls Closed Report');
    userEvent.click(screen.getButton('Send Polls Closed Report'));
    const qrCode = screen.getByTestId('quick-results-code');
    expect(qrCode).toBeInTheDocument();
    expect(qrCode).toHaveAttribute('data-value', 'https://example.com/qr1');
    expect(screen.queryByText('Done')).toBeNull();
    screen.queryByText('1 / 2');
    userEvent.click(screen.getButton('Next'));
    screen.queryByText('2 / 2');
    const qrCode2 = screen.getByTestId('quick-results-code');
    expect(qrCode2).toBeInTheDocument();
    expect(qrCode2).toHaveAttribute('data-value', 'https://example.com/qr2');
    userEvent.click(screen.getButton('Done'));
  });

  test('pause voting', async () => {
    apiMock.expectPauseVoting();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_paused');
    userEvent.click(screen.getByText('Menu'));
    userEvent.click(await screen.findByText('Pause Voting'));
    await screen.findByText('Pausing Voting…');
    await screen.findByText('Voting Paused');
    expect(screen.queryByText('Send Voting Paused Report')).toBeNull();
  });

  test('pause voting happy path with live results', async () => {
    apiMock.expectPauseVoting();
    apiMock.expectGetQuickResultsReportingUrl(['https://example.com/qr']);
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_paused');
    userEvent.click(screen.getByText('Menu'));
    userEvent.click(await screen.findByText('Pause Voting'));
    await screen.findByText('Pausing Voting…');
    await screen.findByText('Voting Paused');
    await screen.findByText('Reprint Voting Paused Report');
    userEvent.click(screen.getButton('Send Voting Paused Report'));
    const qrCode = await screen.findByTestId('quick-results-code');
    expect(qrCode).toBeInTheDocument();
    userEvent.click(screen.getButton('Done'));
    await screen.findByText('Resume Voting');
  });
});

describe('transitions from polls paused', () => {
  beforeEach(async () => {
    apiMock.expectGetPollsInfo('polls_paused');
    renderScreen({
      scannedBallotCount: 7,
    });
    await screen.findByText('Do you want to resume voting?');
  });

  test('resume voting happy path', async () => {
    apiMock.expectResumeVoting();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_open', { type: 'resume_voting' });
    userEvent.click(screen.getByText('Resume Voting'));
    await screen.findByText('Resuming Voting…');
    await screen.findByText('Voting Resumed');
  });

  test('resume voting from landing screen', async () => {
    apiMock.expectResumeVoting();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_open', { type: 'resume_voting' });
    userEvent.click(screen.getByText('Menu'));
    userEvent.click(await screen.findByText('Resume Voting'));
    await screen.findByText('Resuming Voting…');
    await screen.findByText('Voting Resumed');
  });

  test('resume voting happy path with vxqr', async () => {
    apiMock.expectResumeVoting();
    apiMock.expectGetQuickResultsReportingUrl(['https://example.com/qr']);
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_open', { type: 'resume_voting' });
    userEvent.click(screen.getByText('Resume Voting'));
    await screen.findByText('Resuming Voting…');
    await screen.findByText('Voting Resumed');
    await screen.findByText('Reprint Voting Resumed Report');
    userEvent.click(screen.getButton('Send Voting Resumed Report'));
    const qrCode = screen.getByTestId('quick-results-code');
    expect(qrCode).toBeInTheDocument();
    userEvent.click(screen.getButton('Done'));
    await screen.findByText('Close Polls');
  });

  test('close polls from landing screen', async () => {
    apiMock.expectClosePolls();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getByText('Menu'));
    userEvent.click(await screen.findByText('Close Polls'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls Closed');
    expect(startNewVoterSessionMock).toHaveBeenCalledTimes(1);
  });
});

test('no transitions from polls closed final', async () => {
  apiMock.expectGetPollsInfo('polls_closed_final');
  renderScreen({
    scannedBallotCount: 0,
  });
  await screen.findByText(/Voting is complete/);

  // There should only be the power down, print previous report, and signed hash buttons
  expect(screen.queryAllByRole('button')).toHaveLength(3);
  screen.getButton('Power Down');
  screen.getButton('Print Polls Closed Report');
  screen.getButton('Signed Hash Validation');
  expect(
    screen.queryByText('Print Write-In Image Report')
  ).not.toBeInTheDocument();

  // If the election is not configured for VxQR there should not be an option to view QR code
  expect(
    screen.queryByText('Send Polls Closed Report')
  ).not.toBeInTheDocument();
});

test('polls closed final shows quick results code when configured', async () => {
  apiMock.expectGetQuickResultsReportingUrl(['https://example.com/qr']);
  apiMock.expectGetPollsInfo('polls_closed_final');
  renderScreen({
    scannedBallotCount: 0,
  });
  await screen.findByText(/Voting is complete/);

  expect(screen.queryAllByRole('button')).toHaveLength(4);
  screen.getButton('Power Down');
  screen.getButton('Print Polls Closed Report');
  screen.getButton('Signed Hash Validation');

  const qrButton = screen.getButton('Send Polls Closed Report');
  userEvent.click(qrButton);
  const qrCode = screen.getByTestId('quick-results-code');
  expect(qrCode).toBeInTheDocument();
});

test('polls open shows quick results code when configured', async () => {
  apiMock.expectGetQuickResultsReportingUrl(['https://example.com/qr']);
  apiMock.expectGetPollsInfo('polls_open');
  renderScreen({
    scannedBallotCount: 0,
  });
  const menu = await screen.findButton('Menu');
  userEvent.click(menu);
  await screen.findByText(/Close the polls/);

  expect(screen.queryAllByRole('button')).toHaveLength(6);
  screen.getButton('Close Polls');
  screen.getButton('Power Down');
  screen.getButton('Print Polls Opened Report');
  screen.getButton('Pause Voting');
  screen.getButton('Signed Hash Validation');

  const qrButton = screen.getButton('Send Polls Opened Report');
  userEvent.click(qrButton);
  const qrCode = screen.getByTestId('quick-results-code');
  expect(qrCode).toBeInTheDocument();
});

// confirm that we have an alert and logging that meet VVSG 2.0 1.1.3-B
test('there is a warning if we attempt to open polls with ballots scanned', async () => {
  apiMock.expectGetPollsInfo('polls_closed_initial');
  renderScreen({
    scannedBallotCount: 1,
  });
  await screen.findByText('Do you want to open the polls?');
  apiMock.expectOpenPolls(err('ballots-already-scanned'));
  apiMock.expectGetPollsInfo('polls_closed_initial');
  userEvent.click(screen.getByText('Open Polls'));
  await screen.findByText('Ballots Already Scanned');
});

describe('reprinting previous report', () => {
  test('not available if no previous report', async () => {
    apiMock.expectGetPollsInfo('polls_closed_initial');
    renderScreen({});

    userEvent.click(await screen.findByText('Menu'));
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Open Polls',
      'Signed Hash Validation',
      'Power Down',
    ]);
  });

  test('available after polls open + can reprint afterward', async () => {
    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({});

    userEvent.click(await screen.findByText('Menu'));
    const button = await screen.findByText('Print Polls Opened Report');
    expect(button).toBeEnabled();
    apiMock.expectPrintReportSection(0).resolve();
    userEvent.click(button);
    apiMock.expectPrintReportSection(0).resolve();
    userEvent.click(await screen.findButton('Reprint Polls Opened Report'));
    await screen.findButton('Reprint Polls Opened Report');
  });

  test('available after polls paused', async () => {
    apiMock.expectGetPollsInfo('polls_paused');
    renderScreen({});

    userEvent.click(await screen.findByText('Menu'));
    const button = await screen.findByText('Print Voting Paused Report');
    expect(button).toBeEnabled();
    apiMock.expectPrintReportSection(0).resolve();
    userEvent.click(button);
    await screen.findButton('Reprint Voting Paused Report');
  });

  test('available after polls resumed', async () => {
    apiMock.expectGetPollsInfo('polls_open', { type: 'resume_voting' });
    renderScreen({});

    userEvent.click(await screen.findByText('Menu'));
    const button = await screen.findByText('Print Voting Resumed Report');
    expect(button).toBeEnabled();
    apiMock.expectPrintReportSection(0).resolve();
    userEvent.click(button);
    await screen.findButton('Reprint Voting Resumed Report');
  });

  test('available after polls closed', async () => {
    apiMock.expectGetPollsInfo('polls_closed_final');
    renderScreen({});

    const button = await screen.findByText('Print Polls Closed Report');
    expect(button).toBeEnabled();
    apiMock.expectPrintReportSection(0).resolve();
    userEvent.click(button);
    await screen.findButton('Reprint Polls Closed Report');
  });
});

describe('write-in image report', () => {
  beforeEach(() => {
    apiMock.mockApiClient.getConfig.reset();
    apiMock.expectGetConfig({
      systemSettings: {
        ...DEFAULT_SYSTEM_SETTINGS,
        precinctScanEnableWriteInImageReport: true,
      },
    });
  });

  test('print success flow', async () => {
    apiMock.expectGetPollsInfo('polls_closed_final');
    renderScreen({});

    expect(await screen.findAllByRole('button')).toHaveLength(4);
    const button = await screen.findByText('Print Write-In Image Report');
    apiMock.expectPrintWriteInImageReport().resolve();
    userEvent.click(button);
    await screen.findByText('Printing Report…');
    await screen.findByText('Write-In Image Report Printed');
    screen.getButton('Reprint Write-In Image Report');
    screen.getButton('Done');
  });

  test('print failure shows error with reprint option', async () => {
    apiMock.expectGetPollsInfo('polls_closed_final');
    renderScreen({});

    const button = await screen.findByText('Print Write-In Image Report');
    apiMock
      .expectPrintWriteInImageReport({ state: 'error', type: 'disconnected' })
      .resolve();
    userEvent.click(button);
    await screen.findByText('Printing Stopped');
    screen.getButton('Reprint Write-In Image Report');
    screen.getButton('Done');
  });

  test('print no-paper failure shows out of paper message', async () => {
    apiMock.expectGetPollsInfo('polls_closed_final');
    renderScreen({});

    const button = await screen.findByText('Print Write-In Image Report');
    apiMock.expectPrintWriteInImageReport({ state: 'no-paper' }).resolve();
    userEvent.click(button);
    await screen.findByText('Printing Stopped');
    await screen.findByText(/ran out of paper/);
  });

  test('done returns to poll worker menu', async () => {
    apiMock.expectGetPollsInfo('polls_closed_final');
    renderScreen({});

    const button = await screen.findByText('Print Write-In Image Report');
    apiMock.expectPrintWriteInImageReport().resolve();
    userEvent.click(button);
    await screen.findByText('Write-In Image Report Printed');
    userEvent.click(screen.getButton('Done'));
    await screen.findByText(/Voting is complete/);
  });
});

describe('must have printer attached to transition polls and print reports', () => {
  test('polls open', async () => {
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.setPrinterStatus({ state: 'error', type: 'disconnected' });
    renderScreen({});

    const attachText = await screen.findByText('The printer is disconnected');
    expect(screen.getButton('Open Polls')).toBeDisabled();
    apiMock.setPrinterStatus({ state: 'idle' });
    await waitForElementToBeRemoved(attachText);
    apiMock.expectOpenPolls();
    const { resolve } = apiMock.expectPrintReportSection(0);
    resolve();
    apiMock.expectGetPollsInfo('polls_open');
    userEvent.click(screen.getByText('Open Polls'));
    await screen.findByText('Reprint Polls Opened Report');

    apiMock.setPrinterStatus({ state: 'error', type: 'disconnected' });
    await waitFor(() => {
      expect(screen.getButton('Reprint Polls Opened Report')).toBeDisabled();
    });
  });

  test('polls open from fallback screen', async () => {
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.setPrinterStatus({ state: 'error', type: 'disconnected' });
    renderScreen({});

    await screen.findByText('The printer is disconnected');

    // Go to screen with all options available
    userEvent.click(screen.getByText('Menu'));
    // Check that Open Polls is disabled
    expect(screen.getButton('Open Polls')).toBeDisabled();

    apiMock.setPrinterStatus({ state: 'idle' });
    apiMock.expectOpenPolls();
    const { resolve } = apiMock.expectPrintReportSection(0);
    resolve();
    apiMock.expectGetPollsInfo('polls_open');

    await waitFor(() => {
      expect(screen.getButton('Open Polls')).toBeEnabled();
    });

    userEvent.click(screen.getByText('Open Polls'));
    await screen.findByText('Reprint Polls Opened Report');

    apiMock.setPrinterStatus({ state: 'error', type: 'disconnected' });
    await waitFor(() => {
      expect(screen.getButton('Reprint Polls Opened Report')).toBeDisabled();
    });
  });

  test('additional reports', async () => {
    apiMock.setPrinterStatus();
    apiMock.expectGetPollsInfo('polls_closed_initial');
    renderScreen({});

    apiMock.expectOpenPolls();
    const { resolve } = apiMock.expectPrintReportSection(0);
    resolve();
    apiMock.expectGetPollsInfo('polls_open');
    userEvent.click(await screen.findByText('Open Polls'));
    expect(
      await screen.findByText('Reprint Polls Opened Report')
    ).toBeEnabled();

    apiMock.setPrinterStatus({ state: 'error', type: 'disconnected' });
    await waitFor(() => {
      expect(screen.getButton('Reprint Polls Opened Report')).toBeDisabled();
    });
  });

  test('polls close', async () => {
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.setPrinterStatus({ state: 'error', type: 'disconnected' });
    renderScreen({});

    const attachText = await screen.findByText('The printer is disconnected');
    expect(screen.getButton('Close Polls')).toBeDisabled();

    apiMock.setPrinterStatus({ state: 'idle' });
    await waitForElementToBeRemoved(attachText);
    apiMock.expectClosePolls();
    const { resolve } = apiMock.expectPrintReportSection(0);
    resolve();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getByText('Close Polls'));
    await screen.findByText('Reprint Polls Closed Report');
    expect(startNewVoterSessionMock).toHaveBeenCalledTimes(1);
  });

  test('polls close from fallback screen', async () => {
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.setPrinterStatus({ state: 'error', type: 'disconnected' });
    renderScreen({});
    await screen.findByText('The printer is disconnected');

    userEvent.click(screen.getByText('Menu'));

    expect(screen.getButton('Close Polls')).toBeDisabled();

    apiMock.setPrinterStatus({ state: 'idle' });
    await waitFor(() => {
      expect(screen.getButton('Close Polls')).toBeEnabled();
    });

    apiMock.expectClosePolls();
    const { resolve } = apiMock.expectPrintReportSection(0);
    resolve();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getByText('Close Polls'));
    await screen.findByText('Reprint Polls Closed Report');
    expect(startNewVoterSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe('must have usb drive attached to transition polls', () => {
  test('opening polls', async () => {
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.setPrinterStatus();
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});

    const attachText = await screen.findByText(
      'Insert a USB drive to continue.'
    );
    expect(screen.getButton('Open Polls')).toBeDisabled();
    apiMock.expectGetUsbDriveStatus('mounted');
    await waitForElementToBeRemoved(attachText);
    apiMock.expectOpenPolls();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_open');
    userEvent.click(screen.getByText('Open Polls'));
    await screen.findByText('Reprint Polls Opened Report');
  });

  test('opening polls from fallback screen', async () => {
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.setPrinterStatus();
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});

    await screen.findByText('Insert a USB drive to continue.');

    // Go to screen with all options available
    userEvent.click(screen.getByText('Menu'));
    // Check that Open Polls is disabled
    expect(screen.getButton('Open Polls')).toBeDisabled();

    apiMock.expectGetUsbDriveStatus('mounted');
    apiMock.expectOpenPolls();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_open');

    await waitFor(() => {
      expect(screen.getButton('Open Polls')).toBeEnabled();
    });

    userEvent.click(screen.getByText('Open Polls'));
    await screen.findByText('Reprint Polls Opened Report');
  });

  test('resuming voting', async () => {
    apiMock.expectGetPollsInfo('polls_paused');
    apiMock.setPrinterStatus();
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});

    const attachText = await screen.findByText(
      'Insert a USB drive to continue.'
    );
    expect(screen.getButton('Resume Voting')).toBeDisabled();

    apiMock.expectGetUsbDriveStatus('mounted');
    await waitForElementToBeRemoved(attachText);
    apiMock.expectResumeVoting();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_open');
    userEvent.click(screen.getByText('Resume Voting'));
    await screen.findByText('Voting Resumed');
  });

  test('resuming voting from fallback screen', async () => {
    apiMock.expectGetPollsInfo('polls_paused');
    apiMock.setPrinterStatus();
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});

    await screen.findByText('Insert a USB drive to continue.');
    userEvent.click(screen.getByText('Menu'));

    expect(screen.getButton('Resume Voting')).toBeDisabled();
    expect(screen.getButton('Close Polls')).toBeDisabled();

    apiMock.expectGetUsbDriveStatus('mounted');

    await waitFor(() => {
      expect(screen.getButton('Resume Voting')).toBeEnabled();
      expect(screen.getButton('Close Polls')).toBeEnabled();
    });
    apiMock.expectClosePolls();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getByText('Close Polls'));
    await screen.findByText('Reprint Polls Closed Report');
  });

  test('closing polls', async () => {
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.setPrinterStatus();
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});

    const attachText = await screen.findByText(
      'Insert a USB drive to continue.'
    );
    expect(screen.getButton('Close Polls')).toBeDisabled();

    apiMock.expectGetUsbDriveStatus('mounted');
    await waitForElementToBeRemoved(attachText);
    apiMock.expectClosePolls();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getByText('Close Polls'));
    await screen.findByText('Reprint Polls Closed Report');
    expect(startNewVoterSessionMock).toHaveBeenCalledTimes(1);
  });

  test('closing polls from fallback screen', async () => {
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.setPrinterStatus();
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});
    await screen.findByText('Insert a USB drive to continue.');

    userEvent.click(screen.getByText('Menu'));

    expect(screen.getButton('Close Polls')).toBeDisabled();
    // Allow pausing in unexpected situations.
    expect(screen.getButton('Pause Voting')).toBeEnabled();

    apiMock.expectGetUsbDriveStatus('mounted');
    await waitFor(() => {
      expect(screen.getButton('Close Polls')).toBeEnabled();
    });

    apiMock.expectClosePolls();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getByText('Close Polls'));
    await screen.findByText('Reprint Polls Closed Report');
    expect(startNewVoterSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe('does not need usb drive attached to transition polls if continuous export disabled', () => {
  beforeEach(() => {
    apiMock.mockApiClient.getConfig.reset();
    apiMock.mockApiClient.getUsbDriveStatus.reset();
    apiMock.expectGetConfig({
      isContinuousExportEnabled: false,
    });
  });

  test('opening polls', async () => {
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.setPrinterStatus();
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});

    await screen.findButton('Open Polls');
    expect(
      screen.queryByText('Insert a USB drive to continue.')
    ).not.toBeInTheDocument();

    apiMock.expectOpenPolls();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_open');
    userEvent.click(screen.getButton('Open Polls'));
    await screen.findByText('Opening Polls…');
    await screen.findByText('Polls Opened');
  });

  test('opening polls from fallback screen', async () => {
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.setPrinterStatus();
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});

    await screen.findButton('Open Polls');
    expect(
      screen.queryByText('Insert a USB drive to continue.')
    ).not.toBeInTheDocument();

    userEvent.click(screen.getButton('Menu'));
    apiMock.expectOpenPolls();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_open');
    userEvent.click(screen.getButton('Open Polls'));
    await screen.findByText('Opening Polls…');
    await screen.findByText('Polls Opened');
  });

  test('pausing voting', async () => {
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.setPrinterStatus();
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});

    await screen.findButton('Close Polls');
    expect(
      screen.queryByText('Insert a USB drive to continue.')
    ).not.toBeInTheDocument();

    userEvent.click(screen.getButton('Menu'));
    apiMock.expectPauseVoting();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_paused');
    userEvent.click(screen.getButton('Pause Voting'));
    await screen.findByText('Pausing Voting…');
    await screen.findByText('Voting Paused');
  });

  test('resuming voting', async () => {
    apiMock.expectGetPollsInfo('polls_paused');
    apiMock.setPrinterStatus();
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});

    await screen.findButton('Resume Voting');
    expect(
      screen.queryByText('Insert a USB drive to continue.')
    ).not.toBeInTheDocument();

    apiMock.expectResumeVoting();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_open');
    userEvent.click(screen.getButton('Resume Voting'));
    await screen.findByText('Resuming Voting…');
    await screen.findByText('Voting Resumed');
  });

  test('resuming voting from fallback screen', async () => {
    apiMock.expectGetPollsInfo('polls_paused');
    apiMock.setPrinterStatus();
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});

    await screen.findButton('Resume Voting');
    expect(
      screen.queryByText('Insert a USB drive to continue.')
    ).not.toBeInTheDocument();

    userEvent.click(screen.getButton('Menu'));
    apiMock.expectResumeVoting();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_open');
    userEvent.click(screen.getButton('Resume Voting'));
    await screen.findByText('Resuming Voting…');
    await screen.findByText('Voting Resumed');
  });

  test('closing polls', async () => {
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.setPrinterStatus();
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});

    await screen.findButton('Close Polls');
    expect(
      screen.queryByText('Insert a USB drive to continue.')
    ).not.toBeInTheDocument();

    apiMock.expectClosePolls();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getButton('Close Polls'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls Closed');
  });

  test('closing polls from fallback screen', async () => {
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.setPrinterStatus();
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});

    await screen.findButton('Close Polls');
    expect(
      screen.queryByText('Insert a USB drive to continue.')
    ).not.toBeInTheDocument();

    userEvent.click(screen.getButton('Menu'));
    apiMock.expectClosePolls();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getButton('Close Polls'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls Closed');
  });

  test('closing polls from voting paused', async () => {
    apiMock.expectGetPollsInfo('polls_paused');
    apiMock.setPrinterStatus();
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});

    await screen.findButton('Resume Voting');
    expect(
      screen.queryByText('Insert a USB drive to continue.')
    ).not.toBeInTheDocument();

    userEvent.click(screen.getButton('Menu'));
    apiMock.expectClosePolls();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getButton('Close Polls'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls Closed');
  });
});

describe('report printing', () => {
  test('single report printing happy path works to report polls open', async () => {
    apiMock.setPrinterStatus();
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.expectGetQuickResultsReportingUrl(['https://example.com/qr']);
    apiMock.expectOpenPolls();
    const { resolve } = apiMock.expectPrintReportSection(0);
    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({
      electionDefinition:
        electionFamousNames2021Fixtures.readElectionDefinition(),
    });

    // close polls to trigger first section to print
    await screen.findByText('Do you want to open the polls?');
    // Opening polls will cause this to be refetched
    userEvent.click(screen.getByText('Open Polls'));
    await screen.findByText('Opening Polls…');
    resolve();
    await screen.findByText('Polls Opened');
    screen.getByText(
      'Report printed. Remove the poll worker card once you have printed all necessary reports.'
    );

    // try reprinting that report
    const { resolve: resolveReprint } = apiMock.expectPrintReportSection(0);
    userEvent.click(screen.getButton('Reprint Polls Opened Report'));
    await screen.findByText('Printing Report…');
    resolveReprint();
    await screen.findByText('Polls Opened');
    screen.getByText(
      'Report printed. Remove the poll worker card once you have printed all necessary reports.'
    );

    userEvent.click(screen.getButton('Send Polls Opened Report'));
    const qrCode = screen.getByTestId('quick-results-code');
    expect(qrCode).toBeInTheDocument();
    userEvent.click(screen.getButton('Done'));
    await screen.findByText('Close Polls');
  });

  test('multiple report printing happy path with reporting polls open', async () => {
    apiMock.setPrinterStatus();
    apiMock.expectGetQuickResultsReportingUrl(['https://example.com/qr']);
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.expectOpenPolls();
    // A primary prints one page per party (Mammal, Fish) plus nonpartisan
    // contests. The backend reports the section count (3) with the first page.
    const { resolve: resolvePage1 } = apiMock.expectPrintReportSection(
      0,
      undefined,
      3
    );
    const { resolve: resolvePage2 } = apiMock.expectPrintReportSection(1);
    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({
      electionDefinition: electionTwoPartyPrimaryDefinition,
    });

    await screen.findByText('Do you want to open the polls?');
    userEvent.click(screen.getByText('Open Polls'));
    // The first page prints during the transition (total pages unknown until it
    // returns)
    await screen.findByText('Opening Polls…');
    resolvePage1();
    await screen.findByText('Polls Opened');
    await screen.findByText(/Finished printing report 1 of 3/);

    // Remaining pages print one at a time so the poll worker can tear each off
    userEvent.click(screen.getButton('Print Next Report'));
    await screen.findByText(/Printing report 2 of 3/);
    resolvePage2();
    await screen.findByText(/Finished printing report 2 of 3/);

    // A misprinted page can be reprinted before advancing to the next page
    const { resolve: resolveReprintPage2 } =
      apiMock.expectPrintReportSection(1);
    userEvent.click(screen.getButton('Print Previous Report'));
    await screen.findByText(/Printing report 2 of 3/);
    resolveReprintPage2();
    await screen.findByText(/Finished printing report 2 of 3/);

    const { resolve: resolvePage3 } = apiMock.expectPrintReportSection(2);
    userEvent.click(screen.getButton('Print Next Report'));
    await screen.findByText(/Printing report 3 of 3/);
    resolvePage3();
    await screen.findByText(/Report printed/);

    // Reprinting produces one additional complete copy (all party pages),
    // one page at a time
    const { resolve: resolveReprint1 } = apiMock.expectPrintReportSection(
      0,
      undefined,
      3
    );
    userEvent.click(screen.getButton('Reprint Polls Opened Report'));
    await screen.findByText('Printing Report…');
    resolveReprint1();
    await screen.findByText(/Finished printing report 1 of 3/);
    const { resolve: resolveReprint2 } = apiMock.expectPrintReportSection(1);
    userEvent.click(screen.getButton('Print Next Report'));
    resolveReprint2();
    await screen.findByText(/Finished printing report 2 of 3/);
    const { resolve: resolveReprint3 } = apiMock.expectPrintReportSection(2);
    userEvent.click(screen.getButton('Print Next Report'));
    resolveReprint3();
    await screen.findByText(/Report printed/);

    // We should also get an option to report polls open at this point via VxQR
    userEvent.click(screen.getButton('Send Polls Opened Report'));
    const qrCode = screen.getByTestId('quick-results-code');
    expect(qrCode).toBeInTheDocument();
    userEvent.click(screen.getButton('Done'));
    await screen.findByText('Close Polls');
  });

  test('suspension report printing happy path, for primary', async () => {
    apiMock.setPrinterStatus();
    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({
      electionDefinition: electionTwoPartyPrimaryDefinition,
    });

    // pause voting flow
    await screen.findByText('Do you want to close the polls?');
    userEvent.click(screen.getByText('Menu'));
    apiMock.expectGetPollsInfo('polls_paused');
    apiMock.expectPauseVoting();
    const { resolve: resolveReport } = apiMock.expectPrintReportSection(0);
    userEvent.click(screen.getButton('Pause Voting'));
    await screen.findByText('Pausing Voting…');
    resolveReport();
    await screen.findByText('Voting Paused');
    screen.getByText(/Voting Paused Report/);

    // reprinting flow
    expect(screen.getAllByRole('button')).toHaveLength(1); // only one reprint button
    const { resolve: resolveReprintReport } =
      apiMock.expectPrintReportSection(0);
    userEvent.click(screen.getButton('Reprint Voting Paused Report'));
    resolveReprintReport();
    await screen.findByText('Voting Paused');
    screen.getByText(/Voting Paused Report/);
    expect(screen.getAllByRole('button')).toHaveLength(1); // still only one reprint button
    screen.getButton('Reprint Voting Paused Report');
  });

  test('out of paper while printing, reload, reprint', async () => {
    apiMock.setPrinterStatus();
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.expectOpenPolls();

    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({
      electionDefinition: electionTwoPartyPrimaryDefinition,
    });

    // open polls but fail the first page. The backend still reports the section
    // count (3) with the failed print.
    await screen.findByText('Do you want to open the polls?');
    const { resolve } = apiMock.expectPrintReportSection(
      0,
      { state: 'no-paper' },
      3
    );
    apiMock.setPrinterStatus({ state: 'no-paper' });
    userEvent.click(screen.getByText('Open Polls'));
    await screen.findByText('Opening Polls…');
    resolve();
    await screen.findByText('Printing Stopped');
    screen.getByText(/out of paper/);

    // reloading flow
    userEvent.click(await screen.findButton('Load Paper'));
    await screen.findByRole('alertdialog');
    screen.getByText('Remove Paper Roll Holder');

    apiMock.setPrinterStatus({ state: 'cover-open' });
    await screen.findByText('Load New Paper Roll');

    apiMock.setPrinterStatus();
    await screen.findByText('Paper Detected');

    userEvent.click(screen.getButton('Close'));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    // reprinting resumes the report, one page at a time
    const { resolve: resolveReprint1 } = apiMock.expectPrintReportSection(0);
    userEvent.click(await screen.findButton('Reprint Polls Opened Report'));
    await screen.findByText(/Printing report 1 of 3/);
    resolveReprint1();
    await screen.findByText(/Finished printing report 1 of 3/);
    const { resolve: resolveReprint2 } = apiMock.expectPrintReportSection(1);
    userEvent.click(screen.getButton('Print Next Report'));
    resolveReprint2();
    await screen.findByText(/Finished printing report 2 of 3/);
    const { resolve: resolveReprint3 } = apiMock.expectPrintReportSection(2);
    userEvent.click(screen.getButton('Print Next Report'));
    resolveReprint3();
    await screen.findByText('Polls Opened');
    await screen.findByText(/Report printed/);
  });

  test('printer error while printing', async () => {
    apiMock.setPrinterStatus();
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.expectOpenPolls();
    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({
      electionDefinition: electionTwoPartyPrimaryDefinition,
    });

    // close polls but fail the print
    await screen.findByText('Do you want to open the polls?');
    const { resolve } = apiMock.expectPrintReportSection(0, {
      state: 'error',
      type: 'disconnected',
    });
    userEvent.click(screen.getByText('Open Polls'));
    await screen.findByText('Opening Polls…');
    resolve();
    await screen.findByText('Printing Stopped');
    screen.getByText(/unexpected error/);
  });

  test.each<PollsState>(['polls_closed_initial', 'polls_paused', 'polls_open'])(
    'printer status messages show on flow screen: %s',
    async (state) => {
      apiMock.setPrinterStatus({ state: 'error', type: 'disconnected' });
      apiMock.expectGetPollsInfo(state);
      renderScreen({
        electionDefinition: electionTwoPartyPrimaryDefinition,
      });

      await screen.findByText('The printer is disconnected');
      expect(
        screen.getButton(/(Open Polls)|(Close Polls)|(Resume Voting)/)
      ).toBeDisabled();
    }
  );

  test('poll worker menu supports loading printer paper flow', async () => {
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.setPrinterStatus({ state: 'no-paper' });
    renderScreen({});

    userEvent.click(await screen.findByText('Menu'));
    userEvent.click(await screen.findByText('Load Printer Paper'));
    await screen.findByText('Remove Paper Roll Holder');
  });

  test('if printer is loaded, poll worker menu shows reprint button as normal', async () => {
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.setPrinterStatus();
    renderScreen({});

    userEvent.click(await screen.findByText('Menu'));
    const { resolve } = apiMock.expectPrintReportSection(0);
    userEvent.click(await screen.findButton('Print Polls Opened Report'));
    resolve();
    await screen.findButton('Reprint Polls Opened Report');
  });
});

describe('multiple report copies', () => {
  beforeEach(() => {
    apiMock.mockApiClient.getConfig.reset();
    apiMock.expectGetConfig({
      systemSettings: {
        ...DEFAULT_SYSTEM_SETTINGS,
        precinctScanNumberOfReportCopies: 2,
      },
    });
  });

  test('prints the configured number of copies on a polls transition', async () => {
    apiMock.setPrinterStatus();
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.expectClosePolls();
    // A general election prints one page per copy (both from section 0)
    const { resolve: resolvePage1 } = apiMock.expectPrintReportSection(0);
    const { resolve: resolvePage2 } = apiMock.expectPrintReportSection(0);
    apiMock.expectGetPollsInfo('polls_closed_final');
    renderScreen({
      electionDefinition:
        electionFamousNames2021Fixtures.readElectionDefinition(),
    });

    await screen.findByText('Do you want to close the polls?');
    userEvent.click(screen.getByText('Close Polls'));

    // First copy prints during the transition
    await screen.findByText('Closing Polls…');
    resolvePage1();
    await screen.findByText('Polls Closed');
    await screen.findByText(/Finished printing report 1 of 2/);

    // The next copy is printed via the page button so it can be torn off
    userEvent.click(screen.getButton('Print Next Report'));
    await screen.findByText(/Printing report 2 of 2/);
    resolvePage2();
    await screen.findByText(/Report printed/);
    screen.getButton('Reprint Polls Closed Report');
  });

  test('interleaves copies of every party page in a primary', async () => {
    apiMock.setPrinterStatus();
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.expectClosePolls();
    // Two copies of a three-section primary report (Mammal, Fish, Nonpartisan),
    // interleaved so each full copy prints before the next: the print sections
    // are requested in order 0, 1, 2, 0, 1, 2. mockFunction enforces this order.
    // The backend reports the section count (3) with the first report.
    const sectionOrder = [0, 1, 2, 0, 1, 2];
    const resolvers = sectionOrder.map((section, i) =>
      apiMock.expectPrintReportSection(section, undefined, i === 0 ? 3 : 1)
    );
    apiMock.expectGetPollsInfo('polls_closed_final');
    renderScreen({
      electionDefinition: electionTwoPartyPrimaryDefinition,
    });

    await screen.findByText('Do you want to close the polls?');
    userEvent.click(screen.getByText('Close Polls'));

    // First page prints during the transition; each subsequent page via the button
    await screen.findByText('Closing Polls…');
    resolvers[0].resolve();
    await screen.findByText(/Finished printing report 1 of 6/);
    for (let page = 2; page <= 6; page += 1) {
      userEvent.click(screen.getButton('Print Next Report'));
      await screen.findByText(new RegExp(`Printing report ${page} of 6`));
      resolvers[page - 1].resolve();
      if (page < 6) {
        await screen.findByText(
          new RegExp(`Finished printing report ${page} of 6`)
        );
      }
    }

    await screen.findByText('Polls Closed');
    await screen.findByText(/Report printed/);
    screen.getButton('Reprint Polls Closed Report');
  });

  test('stops printing copies if a page fails', async () => {
    apiMock.setPrinterStatus();
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.expectClosePolls();
    // Only the first page is attempted; the failure halts the remaining copies
    const { resolve } = apiMock.expectPrintReportSection(0, {
      state: 'no-paper',
    });
    apiMock.expectGetPollsInfo('polls_closed_final');
    renderScreen({
      electionDefinition:
        electionFamousNames2021Fixtures.readElectionDefinition(),
    });

    await screen.findByText('Do you want to close the polls?');
    userEvent.click(screen.getByText('Close Polls'));

    await screen.findByText('Closing Polls…');
    resolve();

    await screen.findByText('Printing Stopped');
    screen.getByText(/out of paper/);

    // Once the error is resolved the poll worker can pick up where they left
    // off: reprint the failed page...
    const { resolve: resolveRetry } = apiMock.expectPrintReportSection(0);
    userEvent.click(screen.getButton('Reprint Polls Closed Report'));
    await screen.findByText(/Printing report 1 of 2/);
    resolveRetry();
    await screen.findByText(/Finished printing report 1 of 2/);

    // ...and continue with the remaining copy
    const { resolve: resolvePage2 } = apiMock.expectPrintReportSection(0);
    userEvent.click(screen.getButton('Print Next Report'));
    await screen.findByText(/Printing report 2 of 2/);
    resolvePage2();
    await screen.findByText(/Report printed/);
    screen.getButton('Reprint Polls Closed Report');
  });

  test('pause and resume reports print the configured number of copies', async () => {
    apiMock.setPrinterStatus();
    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({
      electionDefinition: electionTwoPartyPrimaryDefinition,
    });

    await screen.findByText('Do you want to close the polls?');
    userEvent.click(screen.getByText('Menu'));
    apiMock.expectGetPollsInfo('polls_paused');
    apiMock.expectPauseVoting();
    // A paused report is a single section even in a primary, but the copies
    // setting still applies: 1 section × 2 copies = 2 reports
    const { resolve: resolveCopy1 } = apiMock.expectPrintReportSection(0);
    userEvent.click(screen.getButton('Pause Voting'));
    await screen.findByText('Pausing Voting…');
    resolveCopy1();
    await screen.findByText('Voting Paused');
    await screen.findByText(/Finished printing report 1 of 2/);

    const { resolve: resolveCopy2 } = apiMock.expectPrintReportSection(0);
    userEvent.click(screen.getButton('Print Next Report'));
    await screen.findByText(/Printing report 2 of 2/);
    resolveCopy2();
    await screen.findByText(/Report printed/);
    screen.getButton('Reprint Voting Paused Report');
  });
});

test('Signed hash validation', async () => {
  apiMock.expectGetPollsInfo('polls_open');
  renderScreen({});

  userEvent.click(await screen.findByText('Menu'));
  expect(screen.queryByText('Signed Hash Validation')).toBeTruthy();

  apiMock.expectGenerateSignedHashValidationQrCodeValue();
  userEvent.click(screen.getByText('Signed Hash Validation'));
  await screen.findByText('Done');
});

describe('election day polls close time enforcement', () => {
  const POLLS_CLOSE_TIME = '20:00:00';
  const BEFORE_CLOSE_TIME = new Date('2021-06-06T19:59:00');
  const AFTER_CLOSE_TIME = new Date('2021-06-06T20:01:00');

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('official election day mode, before close time, disallow flag set', () => {
    beforeEach(() => {
      vi.setSystemTime(BEFORE_CLOSE_TIME);
      apiMock.mockApiClient.getConfig.reset();
      apiMock.expectGetConfig({
        isTestMode: false,
        ballotCastingMode: 'election_day',
        systemSettings: {
          ...DEFAULT_SYSTEM_SETTINGS,
          electionDayPollsCloseTime: POLLS_CLOSE_TIME,
          disallowClosingPollsBeforeElectionDayPollsCloseTime: true,
        },
      });
    });

    test('poll worker card insert goes directly to menu, not easy-close prompt', async () => {
      apiMock.expectGetPollsInfo('polls_open');
      renderScreen({});

      await screen.findButton('Close Polls');
      expect(
        screen.queryByText('Do you want to close the polls?')
      ).not.toBeInTheDocument();
    });

    test('Close Polls button is disabled in menu', async () => {
      apiMock.expectGetPollsInfo('polls_open');
      renderScreen({});

      const closePollsButton = await screen.findButton('Close Polls');
      expect(closePollsButton).toBeDisabled();
    });

    test('description shows cannot close until time', async () => {
      apiMock.expectGetPollsInfo('polls_open');
      renderScreen({});

      await screen.findByText(/Polls cannot be closed until/);
      await screen.findByText(/8:00 PM/);
    });

    test('testmode suppresses enforcement - shows easy-close prompt', async () => {
      apiMock.mockApiClient.getConfig.reset();
      apiMock.expectGetConfig({
        isTestMode: true,
        ballotCastingMode: 'election_day',
        systemSettings: {
          ...DEFAULT_SYSTEM_SETTINGS,
          electionDayPollsCloseTime: POLLS_CLOSE_TIME,
          disallowClosingPollsBeforeElectionDayPollsCloseTime: true,
        },
      });
      apiMock.expectGetPollsInfo('polls_open');
      renderScreen({});

      await screen.findByText('Close Polls');
      expect(
        screen.queryByText(/Polls cannot be closed until/)
      ).not.toBeInTheDocument();
    });
  });

  test('after close time, easy-close prompt appears normally', async () => {
    vi.setSystemTime(AFTER_CLOSE_TIME);
    apiMock.mockApiClient.getConfig.reset();
    apiMock.expectGetConfig({
      isTestMode: false,
      ballotCastingMode: 'election_day',
      systemSettings: {
        ...DEFAULT_SYSTEM_SETTINGS,
        electionDayPollsCloseTime: POLLS_CLOSE_TIME,
        disallowClosingPollsBeforeElectionDayPollsCloseTime: true,
      },
    });
    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({});

    await screen.findByText('Do you want to close the polls?');
  });

  describe('early voting mode', () => {
    test('before close time - Pause Voting is primary action', async () => {
      vi.setSystemTime(BEFORE_CLOSE_TIME);
      apiMock.mockApiClient.getConfig.reset();
      apiMock.expectGetConfig({
        isTestMode: false,
        ballotCastingMode: 'early_voting',
        systemSettings: {
          ...DEFAULT_SYSTEM_SETTINGS,
          electionDayPollsCloseTime: POLLS_CLOSE_TIME,
        },
      });
      apiMock.expectGetPollsInfo('polls_open');
      renderScreen({});

      const pauseVotingButton = await screen.findButton('Pause Voting');
      expect(pauseVotingButton).toHaveAttribute('data-variant', 'primary');

      expect(screen.queryByText('Close Polls')).not.toBeInTheDocument();
    });

    test('before close time, disallow flag set, polls open - Close Polls in menu is disabled with explanation', async () => {
      vi.setSystemTime(BEFORE_CLOSE_TIME);
      apiMock.mockApiClient.getConfig.reset();
      apiMock.expectGetConfig({
        isTestMode: false,
        ballotCastingMode: 'early_voting',
        systemSettings: {
          ...DEFAULT_SYSTEM_SETTINGS,
          electionDayPollsCloseTime: POLLS_CLOSE_TIME,
          disallowClosingPollsBeforeElectionDayPollsCloseTime: true,
        },
      });
      apiMock.expectGetPollsInfo('polls_open');
      renderScreen({});

      const pauseVotingButton = await screen.findButton('Pause Voting');
      expect(pauseVotingButton).toHaveAttribute('data-variant', 'primary');

      userEvent.click(await screen.findByText('Menu'));
      await screen.findByText(/Polls cannot be closed until/);
      await screen.findByText(/8:00 PM/);
      expect(screen.getButton('Close Polls')).toBeDisabled();
    });

    test('before close time, disallow flag set, polls paused - Close Polls in menu is disabled with explanation', async () => {
      vi.setSystemTime(BEFORE_CLOSE_TIME);
      apiMock.mockApiClient.getConfig.reset();
      apiMock.expectGetConfig({
        isTestMode: false,
        ballotCastingMode: 'early_voting',
        systemSettings: {
          ...DEFAULT_SYSTEM_SETTINGS,
          electionDayPollsCloseTime: POLLS_CLOSE_TIME,
          disallowClosingPollsBeforeElectionDayPollsCloseTime: true,
        },
      });
      apiMock.expectGetPollsInfo('polls_paused');
      renderScreen({});

      const resumeVotingButton = await screen.findButton('Resume Voting');
      expect(resumeVotingButton).toHaveAttribute('data-variant', 'primary');

      userEvent.click(await screen.findByText('Menu'));
      await screen.findByText(/Polls cannot be closed until/);
      await screen.findByText(/8:00 PM/);
      expect(screen.getButton('Close Polls')).toBeDisabled();
    });

    test('past close time - Close Polls is primary action in menu', async () => {
      vi.setSystemTime(AFTER_CLOSE_TIME);
      apiMock.mockApiClient.getConfig.reset();
      apiMock.expectGetConfig({
        isTestMode: false,
        ballotCastingMode: 'early_voting',
        systemSettings: {
          ...DEFAULT_SYSTEM_SETTINGS,
          electionDayPollsCloseTime: POLLS_CLOSE_TIME,
        },
      });
      apiMock.expectGetPollsInfo('polls_open');
      renderScreen({});

      userEvent.click(await screen.findByText('Menu'));
      // "Close Polls" should be the primary button
      const closePollsButton = await screen.findButton('Close Polls');
      expect(closePollsButton).toHaveAttribute('data-variant', 'primary');
      // "Pause Voting" button should be in "Other Actions" section
      const pauseVotingButton = await screen.findButton('Pause Voting');
      expect(pauseVotingButton).not.toHaveAttribute('data-variant', 'primary');
    });

    test('past close time - easy-close shows ClosePollsPromptScreen', async () => {
      vi.setSystemTime(AFTER_CLOSE_TIME);
      apiMock.mockApiClient.getConfig.reset();
      apiMock.expectGetConfig({
        isTestMode: false,
        ballotCastingMode: 'early_voting',
        systemSettings: {
          ...DEFAULT_SYSTEM_SETTINGS,
          electionDayPollsCloseTime: POLLS_CLOSE_TIME,
        },
      });
      apiMock.expectGetPollsInfo('polls_open');
      renderScreen({});

      await screen.findByText('Do you want to close the polls?');
      expect(
        screen.queryByText('Do you want to pause voting?')
      ).not.toBeInTheDocument();
    });
  });
});
