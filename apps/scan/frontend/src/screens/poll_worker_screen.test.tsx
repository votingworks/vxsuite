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
import { PollsState } from '@votingworks/types';
import { screen, render } from '../../test/react_testing_library';
import { PollWorkerScreen, PollWorkerScreenProps } from './poll_worker_screen';
import {
  ApiMock,
  createApiMock,
  provideApi,
  statusNoPaper,
} from '../../test/helpers/mock_api_client';

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
  apiMock.expectGetQuickResultsReportingUrl();
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
    apiMock.expectGetQuickResultsReportingUrl('');
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
    apiMock.expectGetQuickResultsReportingUrl('https://example.com/qr');
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
    apiMock.expectGetQuickResultsReportingUrl('https://example.com/qr');
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

  test('pause voting', async () => {
    apiMock.expectPauseVoting();
    apiMock.expectPrintReportSection(0).resolve();
    apiMock.expectGetPollsInfo('polls_paused');
    userEvent.click(screen.getByText('Menu'));
    userEvent.click(await screen.findByText('Pause Voting'));
    await screen.findByText('Pausing Voting…');
    await screen.findByText('Voting Paused');
    expect(screen.queryByText('Send Polls Paused Report')).toBeNull();
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

  // There should only be the power down and print previous report button
  expect(screen.queryAllByRole('button')).toHaveLength(3);
  screen.getButton('Power Down');
  screen.getButton('Print Polls Closed Report');
  screen.getButton('Signed Hash Validation');

  // If the election is not configured for VxQR there should not be an option to view QR code
  expect(
    screen.queryByText('Send Polls Closed Report')
  ).not.toBeInTheDocument();
});

test('polls closed final shows quick results code when configured', async () => {
  apiMock.expectGetQuickResultsReportingUrl('https://example.com/qr');
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
  apiMock.expectGetQuickResultsReportingUrl('https://example.com/qr');
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
    apiMock.expectGetQuickResultsReportingUrl('https://example.com/qr');
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
    apiMock.expectGetQuickResultsReportingUrl('https://example.com/qr');
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.expectOpenPolls();
    const { resolve: resolveMammal } = apiMock.expectPrintReportSection(0);
    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({
      electionDefinition: electionTwoPartyPrimaryDefinition,
    });

    // close polls to trigger first section to print
    await screen.findByText('Do you want to open the polls?');
    // This will be called again when polls are opened
    apiMock.expectGetQuickResultsReportingUrl('https://example.com/qr');
    userEvent.click(screen.getByText('Open Polls'));
    await screen.findByText('Opening Polls…');
    resolveMammal();
    await screen.findByText('Polls Opened');
    screen.getByText(/Mammal Party Polls Opened Report/);

    // try reprinting that report, landing on same page
    const { resolve: resolveMammalReprint } =
      apiMock.expectPrintReportSection(0);
    userEvent.click(screen.getButton('Reprint Previous Report'));
    await screen.findByText('Printing Report…');
    resolveMammalReprint();
    await screen.findByText('Polls Opened');
    screen.getByText(/Mammal Party Polls Opened Report/);

    // continue printing second page
    const { resolve: resolveFish } = apiMock.expectPrintReportSection(1);
    userEvent.click(screen.getButton('Print Next Report'));
    await screen.findByText('Printing Report…');
    resolveFish();
    await screen.findByText('Polls Opened');
    screen.getByText(/Fish Party Polls Opened Report/);

    // continue printing third page
    const { resolve: resolveNonpartisan } = apiMock.expectPrintReportSection(2);
    userEvent.click(screen.getButton('Print Next Report'));
    await screen.findByText('Printing Report…');
    resolveNonpartisan();
    await screen.findByText('Polls Opened');
    screen.getByText(/Nonpartisan Contests Polls Opened Report/);
    screen.getByText(/Remove the poll worker card/);

    // you can reprint last page too
    const { resolve: resolveFishReprint } = apiMock.expectPrintReportSection(2);
    userEvent.click(screen.getButton('Reprint Previous Report'));
    await screen.findByText('Printing Report…');
    resolveFishReprint();
    await screen.findByText('Polls Opened');
    screen.getByText(/Nonpartisan Contests Polls Opened Report/);

    // try reprinting all the pages
    const { resolve: resolveMammalReprint2 } =
      apiMock.expectPrintReportSection(0);
    userEvent.click(screen.getButton('Reprint All Reports'));
    await screen.findByText('Printing Report…');
    resolveMammalReprint2();
    await screen.findByText('Polls Opened');
    screen.getByText(/Mammal Party Polls Opened Report/);

    // Finish printing the next two pages
    const { resolve: resolveFish2 } = apiMock.expectPrintReportSection(1);
    userEvent.click(screen.getButton('Print Next Report'));
    await screen.findByText('Printing Report…');
    resolveFish2();
    await screen.findByText('Polls Opened');
    const { resolve: resolveNonpartisan2 } =
      apiMock.expectPrintReportSection(2);
    userEvent.click(screen.getButton('Print Next Report'));
    await screen.findByText('Printing Report…');
    resolveNonpartisan2();
    await screen.findByText('Polls Opened');

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

    // close polls but fail the print
    await screen.findByText('Do you want to open the polls?');
    const { resolve } = apiMock.expectPrintReportSection(0, {
      state: 'no-paper',
    });
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

    // reprint
    await screen.findButton('Reprint Mammal Party Polls Opened Report');
    const { resolve: resolveMammalReprint } =
      apiMock.expectPrintReportSection(0);
    userEvent.click(
      await screen.findButton('Reprint Mammal Party Polls Opened Report')
    );
    await screen.findByText('Printing Report…');
    resolveMammalReprint();
    await screen.findByText('Polls Opened');
    screen.getByText(/Mammal Party Polls Opened Report/);
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

test('Signed hash validation', async () => {
  apiMock.expectGetPollsInfo('polls_open');
  renderScreen({});

  userEvent.click(await screen.findByText('Menu'));
  expect(screen.queryByText('Signed Hash Validation')).toBeTruthy();

  apiMock.expectGenerateSignedHashValidationQrCodeValue();
  userEvent.click(screen.getByText('Signed Hash Validation'));
  await screen.findByText('Done');
});
