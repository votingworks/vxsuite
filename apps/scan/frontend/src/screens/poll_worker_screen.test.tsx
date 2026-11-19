import {
  vi,
  beforeEach,
  afterEach,
  describe,
  test,
  expect,
  type Mock,
} from 'vitest';
import {
  type BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { userEvent } from '@testing-library/user-event';
import { waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import {
  electionFamousNames2021Fixtures,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { err } from '@votingworks/basics';
import { DEFAULT_SYSTEM_SETTINGS, type PollsState } from '@votingworks/types';
import { screen, render } from '../../test/react_testing_library.js';
import {
  PollWorkerScreen,
  type PollWorkerScreenProps,
} from './poll_worker_screen.js';
import {
  type ApiMock,
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
        {...props}
      />
    )
  );
}

describe('transitions from polls closed initial', () => {
  beforeEach(async () => {
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.expectGetQuickResultsReportingUrl([]);
    renderScreen();
    await screen.findByText('Do you want to open the polls?');
  });

  test('open polls happy path', async () => {
    apiMock.expectOpenPolls();
    const printReport = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_open');
    await userEvent.click(screen.getByText('Open Polls'));
    await screen.findByText('Opening Polls…');
    printReport.resolve();
    await screen.findByText('Polls Opened');
    await screen.findByText('Print Another Copy');
    expect(screen.queryByText('Send Polls Opened Report')).toBeNull();
  });

  test('open polls from landing screen', async () => {
    apiMock.expectOpenPolls();
    const printReport = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_open');
    await userEvent.click(screen.getByText('Menu'));
    await userEvent.click(await screen.findByText('Open Polls'));
    await screen.findByText('Opening Polls…');
    printReport.resolve();
    await screen.findByText('Polls Opened');
    await screen.findByText('Print Another Copy');
    expect(screen.queryByText('Send Polls Opened Report')).toBeNull();
  });

  test('open polls happy path with vxqr', async () => {
    apiMock.expectOpenPolls();
    apiMock.expectGetQuickResultsReportingUrl(['https://example.com/qr']);
    const printReport = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_open');
    await userEvent.click(screen.getByText('Open Polls'));
    await screen.findByText('Opening Polls…');
    printReport.resolve();
    await screen.findByText('Polls Opened');
    await screen.findByText('Print Another Copy');
    await userEvent.click(screen.getButton('Send Polls Opened Report'));
    const qrCode = screen.getByTestId('quick-results-code');
    expect(qrCode).toBeInTheDocument();
    await userEvent.click(screen.getButton('Done'));
    await screen.findByText('Close Polls');
  });
});

describe('transitions from polls open', () => {
  beforeEach(async () => {
    apiMock.expectGetPollsInfo('polls_open');
    renderScreen();
    await screen.findByText('Do you want to close the polls?');
  });

  test('close polls happy path', async () => {
    apiMock.expectClosePolls();
    const printReport = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_closed_final');
    await userEvent.click(screen.getByText('Close Polls'));
    await screen.findByText('Closing Polls…');
    printReport.resolve();
    await screen.findByText('Polls Closed');
    expect(startNewVoterSessionMock).toHaveBeenCalledTimes(1);
    await screen.findByText('Print Another Copy');
    expect(screen.queryByText('Send Polls Closed Report')).toBeNull();
  });

  test('close polls from landing screen', async () => {
    apiMock.expectClosePolls();
    const printReport = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_closed_final');
    await userEvent.click(screen.getByText('Menu'));
    await userEvent.click(await screen.findByText('Close Polls'));
    await screen.findByText('Closing Polls…');
    printReport.resolve();
    await screen.findByText('Polls Closed');
    expect(startNewVoterSessionMock).toHaveBeenCalledTimes(1);
    await screen.findByText('Print Another Copy');
    expect(screen.queryByText('Send Polls Closed Report')).toBeNull();
  });

  test('close polls happy path with vxqr', async () => {
    apiMock.expectClosePolls();
    apiMock.expectGetQuickResultsReportingUrl(['https://example.com/qr']);
    const printReport = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_closed_final');
    await userEvent.click(screen.getByText('Close Polls'));
    await screen.findByText('Closing Polls…');
    printReport.resolve();
    await screen.findByText('Polls Closed');
    expect(startNewVoterSessionMock).toHaveBeenCalledTimes(1);
    await screen.findByText('Print Another Copy');
    await userEvent.click(screen.getButton('Send Polls Closed Report'));
    const qrCode = screen.getByTestId('quick-results-code');
    expect(qrCode).toBeInTheDocument();
    await userEvent.click(screen.getButton('Done'));
  });

  test('close polls happy path with multi-page vxqr', async () => {
    apiMock.expectClosePolls();
    apiMock.expectGetQuickResultsReportingUrl([
      'https://example.com/qr1',
      'https://example.com/qr2',
    ]);
    const printReport = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_closed_final');
    await userEvent.click(screen.getByText('Close Polls'));
    await screen.findByText('Closing Polls…');
    printReport.resolve();
    await screen.findByText('Polls Closed');
    expect(startNewVoterSessionMock).toHaveBeenCalledTimes(1);
    await screen.findByText('Print Another Copy');
    await userEvent.click(screen.getButton('Send Polls Closed Report'));
    const qrCode = screen.getByTestId('quick-results-code');
    expect(qrCode).toBeInTheDocument();
    expect(qrCode).toHaveAttribute('data-value', 'https://example.com/qr1');
    expect(screen.queryByText('Done')).toBeNull();
    screen.queryByText('1 / 2');
    await userEvent.click(screen.getButton('Next'));
    screen.queryByText('2 / 2');
    const qrCode2 = screen.getByTestId('quick-results-code');
    expect(qrCode2).toBeInTheDocument();
    expect(qrCode2).toHaveAttribute('data-value', 'https://example.com/qr2');
    await userEvent.click(screen.getButton('Done'));
  });

  test('pause voting', async () => {
    apiMock.expectPauseVoting();
    const printReport = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_paused');
    await userEvent.click(screen.getByText('Menu'));
    await userEvent.click(await screen.findByText('Pause Voting'));
    await screen.findByText('Pausing Voting…');
    printReport.resolve();
    await screen.findByText('Voting Paused');
    expect(screen.queryByText('Send Voting Paused Report')).toBeNull();
  });

  test('pause voting happy path with live results', async () => {
    apiMock.expectPauseVoting();
    apiMock.expectGetQuickResultsReportingUrl(['https://example.com/qr']);
    const printReport = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_paused');
    await userEvent.click(screen.getByText('Menu'));
    await userEvent.click(await screen.findByText('Pause Voting'));
    await screen.findByText('Pausing Voting…');
    printReport.resolve();
    await screen.findByText('Voting Paused');
    await screen.findByText('Print Another Copy');
    await userEvent.click(screen.getButton('Send Voting Paused Report'));
    const qrCode = await screen.findByTestId('quick-results-code');
    expect(qrCode).toBeInTheDocument();
    await userEvent.click(screen.getButton('Done'));
    await screen.findByText('Resume Voting');
  });
});

describe('transitions from polls paused', () => {
  beforeEach(async () => {
    apiMock.expectGetPollsInfo('polls_paused');
    renderScreen();
    await screen.findByText('Do you want to resume voting?');
  });

  test('resume voting happy path', async () => {
    apiMock.expectResumeVoting();
    const printReport = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_open', { type: 'resume_voting' });
    await userEvent.click(screen.getByText('Resume Voting'));
    await screen.findByText('Resuming Voting…');
    printReport.resolve();
    await screen.findByText('Voting Resumed');
  });

  test('resume voting from landing screen', async () => {
    apiMock.expectResumeVoting();
    const printReport = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_open', { type: 'resume_voting' });
    await userEvent.click(screen.getByText('Menu'));
    await userEvent.click(await screen.findByText('Resume Voting'));
    await screen.findByText('Resuming Voting…');
    printReport.resolve();
    await screen.findByText('Voting Resumed');
  });

  test('resume voting happy path with vxqr', async () => {
    apiMock.expectResumeVoting();
    apiMock.expectGetQuickResultsReportingUrl(['https://example.com/qr']);
    const printReport = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_open', { type: 'resume_voting' });
    await userEvent.click(screen.getByText('Resume Voting'));
    await screen.findByText('Resuming Voting…');
    printReport.resolve();
    await screen.findByText('Voting Resumed');
    await screen.findByText('Print Another Copy');
    await userEvent.click(screen.getButton('Send Voting Resumed Report'));
    const qrCode = screen.getByTestId('quick-results-code');
    expect(qrCode).toBeInTheDocument();
    await userEvent.click(screen.getButton('Done'));
    await screen.findByText('Close Polls');
  });

  test('close polls from landing screen', async () => {
    apiMock.expectClosePolls();
    const printReport = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_closed_final');
    await userEvent.click(screen.getByText('Menu'));
    await userEvent.click(await screen.findByText('Close Polls'));
    await screen.findByText('Closing Polls…');
    printReport.resolve();
    await screen.findByText('Polls Closed');
    expect(startNewVoterSessionMock).toHaveBeenCalledTimes(1);
  });
});

test('no transitions from polls closed final', async () => {
  apiMock.expectGetPollsInfo('polls_closed_final');
  renderScreen();
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
  renderScreen();
  await screen.findByText(/Voting is complete/);

  expect(screen.queryAllByRole('button')).toHaveLength(4);
  screen.getButton('Power Down');
  screen.getButton('Print Polls Closed Report');
  screen.getButton('Signed Hash Validation');

  const qrButton = screen.getButton('Send Polls Closed Report');
  await userEvent.click(qrButton);
  const qrCode = screen.getByTestId('quick-results-code');
  expect(qrCode).toBeInTheDocument();
});

test('polls open shows quick results code when configured', async () => {
  apiMock.expectGetQuickResultsReportingUrl(['https://example.com/qr']);
  apiMock.expectGetPollsInfo('polls_open');
  renderScreen();
  const menu = await screen.findButton('Menu');
  await userEvent.click(menu);
  await screen.findByText(/Close the polls/);

  expect(screen.queryAllByRole('button')).toHaveLength(6);
  screen.getButton('Close Polls');
  screen.getButton('Power Down');
  screen.getButton('Print Polls Opened Report');
  screen.getButton('Pause Voting');
  screen.getButton('Signed Hash Validation');

  const qrButton = screen.getButton('Send Polls Opened Report');
  await userEvent.click(qrButton);
  const qrCode = screen.getByTestId('quick-results-code');
  expect(qrCode).toBeInTheDocument();
});

test('shows lifetime sheet count in the info bar', async () => {
  apiMock.mockApiClient.getScannerStatus.reset();
  apiMock.expectGetPollsInfo('polls_closed_initial');
  apiMock.expectGetScannerStatus({
    ...statusNoPaper,
    lifetimeSheetsCounted: 1234,
  });
  renderScreen();
  await screen.findByText('Do you want to open the polls?');
  const label = await screen.findByText('Lifetime Scans');
  expect(label.parentElement?.lastChild).toHaveTextContent('1,234');
});

// confirm that we have an alert and logging that meet VVSG 2.0 1.1.3-B
test('there is a warning if we attempt to open polls with ballots scanned', async () => {
  apiMock.mockApiClient.getScannerStatus.reset();
  apiMock.expectGetPollsInfo('polls_closed_initial');
  apiMock.expectGetScannerStatus({
    ballotsCounted: 1,
    lifetimeSheetsCounted: 1,
    state: 'waiting_for_ballot',
  });
  renderScreen();
  await screen.findByText('Do you want to open the polls?');
  apiMock.expectOpenPolls(err('ballots-already-scanned'));
  apiMock.expectGetPollsInfo('polls_closed_initial');
  await userEvent.click(screen.getByText('Open Polls'));
  await screen.findByText('Ballots Already Scanned');
});

describe('reprinting previous report', () => {
  test('not available if no previous report', async () => {
    apiMock.expectGetPollsInfo('polls_closed_initial');
    renderScreen({});

    await userEvent.click(await screen.findByText('Menu'));
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Open Polls',
      'Signed Hash Validation',
      'Power Down',
    ]);
  });

  test('available after polls open + can reprint afterward', async () => {
    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({});

    await userEvent.click(await screen.findByText('Menu'));
    const button = await screen.findByText('Print Polls Opened Report');
    expect(button).toBeEnabled();
    apiMock.expectPrintReport().resolve();
    await userEvent.click(button);
    apiMock.expectPrintReport().resolve();
    await userEvent.click(await screen.findButton('Print Another Copy'));
    await screen.findButton('Print Another Copy');
  });

  test('available after polls paused', async () => {
    apiMock.expectGetPollsInfo('polls_paused');
    renderScreen({});

    await userEvent.click(await screen.findByText('Menu'));
    const button = await screen.findByText('Print Voting Paused Report');
    expect(button).toBeEnabled();
    apiMock.expectPrintReport().resolve();
    await userEvent.click(button);
    await screen.findButton('Print Another Copy');
  });

  test('available after polls resumed', async () => {
    apiMock.expectGetPollsInfo('polls_open', { type: 'resume_voting' });
    renderScreen({});

    await userEvent.click(await screen.findByText('Menu'));
    const button = await screen.findByText('Print Voting Resumed Report');
    expect(button).toBeEnabled();
    apiMock.expectPrintReport().resolve();
    await userEvent.click(button);
    await screen.findButton('Print Another Copy');
  });

  test('available after polls closed', async () => {
    apiMock.expectGetPollsInfo('polls_closed_final');
    renderScreen({});

    const button = await screen.findByText('Print Polls Closed Report');
    expect(button).toBeEnabled();
    apiMock.expectPrintReport().resolve();
    await userEvent.click(button);
    await screen.findButton('Print Another Copy');
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
    const printWriteInImageReport = apiMock.expectPrintWriteInImageReport();
    await userEvent.click(button);
    await screen.findByText('Printing Report…');
    printWriteInImageReport.resolve();
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
    await userEvent.click(button);
    await screen.findByText('Printing Stopped');
    screen.getButton('Reprint Write-In Image Report');
    screen.getButton('Done');
  });

  test('print no-paper failure shows out of paper message', async () => {
    apiMock.expectGetPollsInfo('polls_closed_final');
    renderScreen({});

    const button = await screen.findByText('Print Write-In Image Report');
    apiMock.expectPrintWriteInImageReport({ state: 'no-paper' }).resolve();
    await userEvent.click(button);
    await screen.findByText('Printing Stopped');
    await screen.findByText(/ran out of paper/);
  });

  test('done returns to poll worker menu', async () => {
    apiMock.expectGetPollsInfo('polls_closed_final');
    renderScreen({});

    const button = await screen.findByText('Print Write-In Image Report');
    apiMock.expectPrintWriteInImageReport().resolve();
    await userEvent.click(button);
    await screen.findByText('Write-In Image Report Printed');
    await userEvent.click(screen.getButton('Done'));
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
    const { resolve } = apiMock.expectPrintReport();
    resolve();
    apiMock.expectGetPollsInfo('polls_open');
    await userEvent.click(screen.getByText('Open Polls'));
    await screen.findByText('Print Another Copy');

    apiMock.setPrinterStatus({ state: 'error', type: 'disconnected' });
    await waitFor(() => {
      expect(screen.getButton('Print Another Copy')).toBeDisabled();
    });
  });

  test('polls open from fallback screen', async () => {
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.setPrinterStatus({ state: 'error', type: 'disconnected' });
    renderScreen({});

    await screen.findByText('The printer is disconnected');

    // Go to screen with all options available
    await userEvent.click(screen.getByText('Menu'));
    // Check that Open Polls is disabled
    expect(screen.getButton('Open Polls')).toBeDisabled();

    apiMock.setPrinterStatus({ state: 'idle' });
    apiMock.expectOpenPolls();
    const { resolve } = apiMock.expectPrintReport();
    resolve();
    apiMock.expectGetPollsInfo('polls_open');

    await waitFor(() => {
      expect(screen.getButton('Open Polls')).toBeEnabled();
    });

    await userEvent.click(screen.getByText('Open Polls'));
    await screen.findByText('Print Another Copy');

    apiMock.setPrinterStatus({ state: 'error', type: 'disconnected' });
    await waitFor(() => {
      expect(screen.getButton('Print Another Copy')).toBeDisabled();
    });
  });

  test('additional reports', async () => {
    apiMock.setPrinterStatus();
    apiMock.expectGetPollsInfo('polls_closed_initial');
    renderScreen({});

    apiMock.expectOpenPolls();
    const { resolve } = apiMock.expectPrintReport();
    resolve();
    apiMock.expectGetPollsInfo('polls_open');
    await userEvent.click(await screen.findByText('Open Polls'));
    expect(await screen.findByText('Print Another Copy')).toBeEnabled();

    apiMock.setPrinterStatus({ state: 'error', type: 'disconnected' });
    await waitFor(() => {
      expect(screen.getButton('Print Another Copy')).toBeDisabled();
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
    const { resolve } = apiMock.expectPrintReport();
    resolve();
    apiMock.expectGetPollsInfo('polls_closed_final');
    await userEvent.click(screen.getByText('Close Polls'));
    await screen.findByText('Print Another Copy');
    expect(startNewVoterSessionMock).toHaveBeenCalledTimes(1);
  });

  test('polls close from fallback screen', async () => {
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.setPrinterStatus({ state: 'error', type: 'disconnected' });
    renderScreen({});
    await screen.findByText('The printer is disconnected');

    await userEvent.click(screen.getByText('Menu'));

    expect(screen.getButton('Close Polls')).toBeDisabled();

    apiMock.setPrinterStatus({ state: 'idle' });
    await waitFor(() => {
      expect(screen.getButton('Close Polls')).toBeEnabled();
    });

    apiMock.expectClosePolls();
    const { resolve } = apiMock.expectPrintReport();
    resolve();
    apiMock.expectGetPollsInfo('polls_closed_final');
    await userEvent.click(screen.getByText('Close Polls'));
    await screen.findByText('Print Another Copy');
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
    apiMock.expectPrintReport().resolve();
    apiMock.expectGetPollsInfo('polls_open');
    await userEvent.click(screen.getByText('Open Polls'));
    await screen.findByText('Print Another Copy');
  });

  test('opening polls from fallback screen', async () => {
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.setPrinterStatus();
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});

    await screen.findByText('Insert a USB drive to continue.');

    // Go to screen with all options available
    await userEvent.click(screen.getByText('Menu'));
    // Check that Open Polls is disabled
    expect(screen.getButton('Open Polls')).toBeDisabled();

    apiMock.expectGetUsbDriveStatus('mounted');
    apiMock.expectOpenPolls();
    apiMock.expectPrintReport().resolve();
    apiMock.expectGetPollsInfo('polls_open');

    await waitFor(() => {
      expect(screen.getButton('Open Polls')).toBeEnabled();
    });

    await userEvent.click(screen.getByText('Open Polls'));
    await screen.findByText('Print Another Copy');
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
    apiMock.expectPrintReport().resolve();
    apiMock.expectGetPollsInfo('polls_open');
    await userEvent.click(screen.getByText('Resume Voting'));
    await screen.findByText('Voting Resumed');
  });

  test('resuming voting from fallback screen', async () => {
    apiMock.expectGetPollsInfo('polls_paused');
    apiMock.setPrinterStatus();
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});

    await screen.findByText('Insert a USB drive to continue.');
    await userEvent.click(screen.getByText('Menu'));

    expect(screen.getButton('Resume Voting')).toBeDisabled();
    expect(screen.getButton('Close Polls')).toBeDisabled();

    apiMock.expectGetUsbDriveStatus('mounted');

    await waitFor(() => {
      expect(screen.getButton('Resume Voting')).toBeEnabled();
      expect(screen.getButton('Close Polls')).toBeEnabled();
    });
    apiMock.expectClosePolls();
    apiMock.expectPrintReport().resolve();
    apiMock.expectGetPollsInfo('polls_closed_final');
    await userEvent.click(screen.getByText('Close Polls'));
    await screen.findByText('Print Another Copy');
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
    apiMock.expectPrintReport().resolve();
    apiMock.expectGetPollsInfo('polls_closed_final');
    await userEvent.click(screen.getByText('Close Polls'));
    await screen.findByText('Print Another Copy');
    expect(startNewVoterSessionMock).toHaveBeenCalledTimes(1);
  });

  test('closing polls from fallback screen', async () => {
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.setPrinterStatus();
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});
    await screen.findByText('Insert a USB drive to continue.');

    await userEvent.click(screen.getByText('Menu'));

    expect(screen.getButton('Close Polls')).toBeDisabled();
    // Allow pausing in unexpected situations.
    expect(screen.getButton('Pause Voting')).toBeEnabled();

    apiMock.expectGetUsbDriveStatus('mounted');
    await waitFor(() => {
      expect(screen.getButton('Close Polls')).toBeEnabled();
    });

    apiMock.expectClosePolls();
    apiMock.expectPrintReport().resolve();
    apiMock.expectGetPollsInfo('polls_closed_final');
    await userEvent.click(screen.getByText('Close Polls'));
    await screen.findByText('Print Another Copy');
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
    const printReport = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_open');
    await userEvent.click(screen.getButton('Open Polls'));
    await screen.findByText('Opening Polls…');
    printReport.resolve();
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

    await userEvent.click(screen.getButton('Menu'));
    apiMock.expectOpenPolls();
    const printReport = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_open');
    await userEvent.click(screen.getButton('Open Polls'));
    await screen.findByText('Opening Polls…');
    printReport.resolve();
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

    await userEvent.click(screen.getButton('Menu'));
    apiMock.expectPauseVoting();
    const printReport = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_paused');
    await userEvent.click(screen.getButton('Pause Voting'));
    await screen.findByText('Pausing Voting…');
    printReport.resolve();
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
    const printReport = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_open');
    await userEvent.click(screen.getButton('Resume Voting'));
    await screen.findByText('Resuming Voting…');
    printReport.resolve();
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

    await userEvent.click(screen.getButton('Menu'));
    apiMock.expectResumeVoting();
    const printReport = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_open');
    await userEvent.click(screen.getButton('Resume Voting'));
    await screen.findByText('Resuming Voting…');
    printReport.resolve();
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
    const printReport = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_closed_final');
    await userEvent.click(screen.getButton('Close Polls'));
    await screen.findByText('Closing Polls…');
    printReport.resolve();
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

    await userEvent.click(screen.getButton('Menu'));
    apiMock.expectClosePolls();
    const printReport = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_closed_final');
    await userEvent.click(screen.getButton('Close Polls'));
    await screen.findByText('Closing Polls…');
    printReport.resolve();
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

    await userEvent.click(screen.getButton('Menu'));
    apiMock.expectClosePolls();
    const printReport = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_closed_final');
    await userEvent.click(screen.getButton('Close Polls'));
    await screen.findByText('Closing Polls…');
    printReport.resolve();
    await screen.findByText('Polls Closed');
  });
});

describe('report printing', () => {
  test('single report printing happy path works to report polls open', async () => {
    apiMock.setPrinterStatus();
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.expectGetQuickResultsReportingUrl(['https://example.com/qr']);
    apiMock.expectOpenPolls();
    const { resolve } = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({
      electionDefinition:
        electionFamousNames2021Fixtures.readElectionDefinition(),
    });

    await screen.findByText('Do you want to open the polls?');
    // Opening polls will cause this to be refetched
    await userEvent.click(screen.getByText('Open Polls'));
    await screen.findByText('Opening Polls…');
    resolve();
    await screen.findByText('Polls Opened');
    screen.getByText(
      'Report printed. Gently tear off the report. Remove the poll worker card after you have printed any additional copies you need.'
    );

    // try reprinting that report
    const { resolve: resolveReprint } = apiMock.expectPrintReport();
    await userEvent.click(screen.getButton('Print Another Copy'));
    await screen.findByText('Printing Report…');
    resolveReprint();
    await screen.findByText('Polls Opened');
    screen.getByText(
      'Report printed. Gently tear off the report. Remove the poll worker card after you have printed any additional copies you need.'
    );

    await userEvent.click(screen.getButton('Send Polls Opened Report'));
    const qrCode = screen.getByTestId('quick-results-code');
    expect(qrCode).toBeInTheDocument();
    await userEvent.click(screen.getButton('Done'));
    await screen.findByText('Close Polls');
  });

  test('primary report prints as a single report', async () => {
    apiMock.setPrinterStatus();
    apiMock.expectGetQuickResultsReportingUrl(['https://example.com/qr']);
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.expectOpenPolls();
    const { resolve } = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({
      electionDefinition: electionTwoPartyPrimaryDefinition,
    });

    await screen.findByText('Do you want to open the polls?');
    await userEvent.click(screen.getByText('Open Polls'));
    await screen.findByText('Opening Polls…');
    resolve();
    await screen.findByText('Polls Opened');
    await screen.findByText(/Report printed/);
    expect(screen.queryButton('Print Next Copy')).not.toBeInTheDocument();

    const { resolve: resolveReprint } = apiMock.expectPrintReport();
    await userEvent.click(screen.getButton('Print Another Copy'));
    await screen.findByText('Printing Report…');
    resolveReprint();
    await screen.findByText(/Report printed/);
    expect(screen.queryButton('Print Next Copy')).not.toBeInTheDocument();

    await userEvent.click(screen.getButton('Send Polls Opened Report'));
    const qrCode = screen.getByTestId('quick-results-code');
    expect(qrCode).toBeInTheDocument();
    await userEvent.click(screen.getButton('Done'));
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
    await userEvent.click(screen.getByText('Menu'));
    apiMock.expectGetPollsInfo('polls_paused');
    apiMock.expectPauseVoting();
    const { resolve: resolveReport } = apiMock.expectPrintReport();
    await userEvent.click(screen.getButton('Pause Voting'));
    await screen.findByText('Pausing Voting…');
    resolveReport();
    await screen.findByText('Voting Paused');
    screen.getByText(/Report printed/);

    // reprinting flow
    expect(screen.getAllByRole('button')).toHaveLength(1); // only one reprint button
    const { resolve: resolveReprintReport } = apiMock.expectPrintReport();
    await userEvent.click(screen.getButton('Print Another Copy'));
    resolveReprintReport();
    await screen.findByText('Voting Paused');
    screen.getByText(/Report printed/);
    expect(screen.getAllByRole('button')).toHaveLength(1); // still only one reprint button
    screen.getButton('Print Another Copy');
  });

  test('out of paper while printing, reload, reprint', async () => {
    apiMock.setPrinterStatus();
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.expectOpenPolls();

    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({
      electionDefinition: electionTwoPartyPrimaryDefinition,
    });

    await screen.findByText('Do you want to open the polls?');
    const { resolve } = apiMock.expectPrintReport({ state: 'no-paper' });
    await userEvent.click(screen.getByText('Open Polls'));
    await screen.findByText('Opening Polls…');
    apiMock.setPrinterStatus({ state: 'no-paper' });
    resolve();
    await screen.findByText('Printing Stopped');
    screen.getByText(/out of paper/);

    // reloading flow
    await userEvent.click(await screen.findButton('Load Paper'));
    await screen.findByRole('alertdialog');
    screen.getByText('Remove Paper Roll Holder');

    apiMock.setPrinterStatus({ state: 'cover-open' });
    await screen.findByText('Load New Paper Roll');

    apiMock.setPrinterStatus();
    await screen.findByText('Paper Detected');

    await userEvent.click(screen.getButton('Close'));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    const { resolve: resolveReprint } = apiMock.expectPrintReport();
    await userEvent.click(
      await screen.findButton('Reprint Polls Opened Report')
    );
    await screen.findByText('Printing Report…');
    resolveReprint();
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
    const { resolve } = apiMock.expectPrintReport({
      state: 'error',
      type: 'disconnected',
    });
    await userEvent.click(screen.getByText('Open Polls'));
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

    await userEvent.click(await screen.findByText('Menu'));
    await userEvent.click(await screen.findByText('Load Printer Paper'));
    await screen.findByText('Remove Paper Roll Holder');
  });

  test('if printer is loaded, poll worker menu shows reprint button as normal', async () => {
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.setPrinterStatus();
    renderScreen({});

    await userEvent.click(await screen.findByText('Menu'));
    const { resolve } = apiMock.expectPrintReport();
    await userEvent.click(await screen.findButton('Print Polls Opened Report'));
    resolve();
    await screen.findButton('Print Another Copy');
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
    const { resolve: resolvePage1 } = apiMock.expectPrintReport();
    const { resolve: resolvePage2 } = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_closed_final');
    renderScreen({
      electionDefinition:
        electionFamousNames2021Fixtures.readElectionDefinition(),
    });

    await screen.findByText('Do you want to close the polls?');
    await userEvent.click(screen.getByText('Close Polls'));

    // First copy prints during the transition
    await screen.findByText('Closing Polls…');
    resolvePage1();
    await screen.findByText('Polls Closed');
    await screen.findByText(/Copy 1 of 2 printed/);

    // The next copy is printed via the page button so it can be torn off
    await userEvent.click(screen.getButton('Print Next Copy'));
    await screen.findByText(/Printing copy 2 of 2/);
    resolvePage2();
    await screen.findByText(/Copy 2 of 2 printed/);
    screen.getButton('Print Another Copy');
  });

  test('prints each copy of a primary report as one print', async () => {
    apiMock.setPrinterStatus();
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.expectClosePolls();
    const { resolve: resolveCopy1 } = apiMock.expectPrintReport();
    apiMock.expectGetPollsInfo('polls_closed_final');
    renderScreen({
      electionDefinition: electionTwoPartyPrimaryDefinition,
    });

    await screen.findByText('Do you want to close the polls?');
    await userEvent.click(screen.getByText('Close Polls'));

    await screen.findByText('Closing Polls…');
    resolveCopy1();
    await screen.findByText(/Copy 1 of 2 printed/);

    expect(screen.queryButton('Print Previous Report')).not.toBeInTheDocument();

    const { resolve: resolveCopy2 } = apiMock.expectPrintReport();
    await userEvent.click(screen.getButton('Print Next Copy'));
    await screen.findByText(/Printing copy 2 of 2/);
    resolveCopy2();

    await screen.findByText('Polls Closed');
    await screen.findByText(/Copy 2 of 2 printed/);
    screen.getButton('Print Another Copy');
  });

  test('stops printing copies if a page fails', async () => {
    apiMock.setPrinterStatus();
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.expectClosePolls();
    // Only the first page is attempted; the failure halts the remaining copies
    const { resolve } = apiMock.expectPrintReport({
      state: 'no-paper',
    });
    apiMock.expectGetPollsInfo('polls_closed_final');
    renderScreen({
      electionDefinition:
        electionFamousNames2021Fixtures.readElectionDefinition(),
    });

    await screen.findByText('Do you want to close the polls?');
    await userEvent.click(screen.getByText('Close Polls'));

    await screen.findByText('Closing Polls…');
    resolve();

    await screen.findByText('Printing Stopped');
    screen.getByText(/out of paper/);

    // Once the error is resolved the poll worker can pick up where they left
    // off: reprint the failed page...
    const { resolve: resolveRetry } = apiMock.expectPrintReport();
    await userEvent.click(screen.getButton('Reprint Polls Closed Report'));
    await screen.findByText(/Printing copy 1 of 2/);
    resolveRetry();
    await screen.findByText(/Copy 1 of 2 printed/);

    // ...and continue with the remaining copy
    const { resolve: resolvePage2 } = apiMock.expectPrintReport();
    await userEvent.click(screen.getButton('Print Next Copy'));
    await screen.findByText(/Printing copy 2 of 2/);
    resolvePage2();
    await screen.findByText(/Copy 2 of 2 printed/);
    screen.getButton('Print Another Copy');
  });

  test('pause and resume reports print the configured number of copies', async () => {
    apiMock.setPrinterStatus();
    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({
      electionDefinition: electionTwoPartyPrimaryDefinition,
    });

    await screen.findByText('Do you want to close the polls?');
    await userEvent.click(screen.getByText('Menu'));
    apiMock.expectGetPollsInfo('polls_paused');
    apiMock.expectPauseVoting();
    const { resolve: resolveCopy1 } = apiMock.expectPrintReport();
    await userEvent.click(screen.getButton('Pause Voting'));
    await screen.findByText('Pausing Voting…');
    resolveCopy1();
    await screen.findByText('Voting Paused');
    await screen.findByText(/Copy 1 of 2 printed/);

    const { resolve: resolveCopy2 } = apiMock.expectPrintReport();
    await userEvent.click(screen.getButton('Print Next Copy'));
    await screen.findByText(/Printing copy 2 of 2/);
    resolveCopy2();
    await screen.findByText(/Copy 2 of 2 printed/);
    screen.getButton('Print Another Copy');
  });
});

test('Signed hash validation', async () => {
  apiMock.expectGetPollsInfo('polls_open');
  renderScreen({});

  await userEvent.click(await screen.findByText('Menu'));
  expect(screen.queryByText('Signed Hash Validation')).toBeTruthy();

  apiMock.expectGenerateSignedHashValidationQrCodeValue();
  await userEvent.click(screen.getByText('Signed Hash Validation'));
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

      await userEvent.click(await screen.findByText('Menu'));
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

      await userEvent.click(await screen.findByText('Menu'));
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

      await userEvent.click(await screen.findByText('Menu'));
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
