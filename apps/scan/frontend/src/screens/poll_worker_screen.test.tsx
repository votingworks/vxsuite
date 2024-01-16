import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import userEvent from '@testing-library/user-event';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import {
  waitFor,
  waitForElementToBeRemoved,
  within,
} from '@testing-library/react';
import { BROTHER_THERMAL_PRINTER_CONFIG } from '@votingworks/printing';
import { screen, RenderResult, render } from '../../test/react_testing_library';
import { PollWorkerScreen, PollWorkerScreenProps } from './poll_worker_screen';
import {
  ApiMock,
  createApiMock,
  provideApi,
  statusNoPaper,
} from '../../test/helpers/mock_api_client';
import { mockPollsInfo } from '../../test/helpers/mock_polls_info';

let apiMock: ApiMock;

const featureFlagMock = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});

const currentTime = new Date();

jest.mock('../utils/get_current_time', () => ({
  getCurrentTime: () => currentTime.getTime(),
}));

beforeEach(() => {
  featureFlagMock.resetFeatureFlags();
  window.location.href = '/';
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetConfig();
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.setPrinterStatus({
    connected: true,
    config: BROTHER_THERMAL_PRINTER_CONFIG,
  });
});

afterEach(() => {
  window.kiosk = undefined;
  apiMock.mockApiClient.assertComplete();
});

function renderScreen(
  props: Partial<PollWorkerScreenProps> = {}
): RenderResult {
  return render(
    provideApi(
      apiMock,
      <PollWorkerScreen
        scannedBallotCount={0}
        pollsInfo={{ pollsState: 'polls_closed_initial' }}
        logger={fakeLogger()}
        {...props}
      />
    )
  );
}

describe('shows Livecheck button only when enabled', () => {
  test('enable livecheck', async () => {
    featureFlagMock.enableFeatureFlag(BooleanEnvironmentVariableName.LIVECHECK);

    renderScreen({
      scannedBallotCount: 5,
      pollsInfo: mockPollsInfo('polls_open'),
    });

    userEvent.click(await screen.findByText('No'));
    expect(screen.queryByText('Live Check')).toBeTruthy();

    apiMock.expectGenerateLiveCheckQrCodeValue();
    userEvent.click(screen.getByText('Live Check'));
    await screen.findByText('Done');
  });

  test('disable livecheck', async () => {
    featureFlagMock.disableFeatureFlag(
      BooleanEnvironmentVariableName.LIVECHECK
    );

    renderScreen({
      scannedBallotCount: 5,
      pollsInfo: mockPollsInfo('polls_open'),
    });

    userEvent.click(await screen.findByText('No'));
    expect(screen.queryByText('Live Check')).toBeFalsy();
  });
});

describe('transitions from polls closed initial', () => {
  let logger = fakeLogger();
  beforeEach(async () => {
    logger = fakeLogger();
    renderScreen({
      scannedBallotCount: 0,
      pollsInfo: mockPollsInfo('polls_closed_initial'),
      logger,
    });
    await screen.findByText('Do you want to open the polls?');
  });

  test('open polls happy path', async () => {
    apiMock.expectTransitionPolls('open_polls');
    apiMock.expectPrintReport();
    userEvent.click(screen.getByText('Yes, Open the Polls'));
    await screen.findByText('Opening Polls…');
    await screen.findByText('Polls are open.');
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.PollsOpened,
      'poll_worker',
      expect.objectContaining({
        disposition: 'success',
        scannedBallotCount: 0,
      })
    );
  });

  test('open polls from landing screen', async () => {
    apiMock.expectTransitionPolls('open_polls');
    apiMock.expectPrintReport();
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Open Polls'));
    await screen.findByText('Opening Polls…');
    await screen.findByText('Polls are open.');
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.PollsOpened,
      'poll_worker',
      expect.objectContaining({
        disposition: 'success',
        scannedBallotCount: 0,
      })
    );
  });
});

describe('transitions from polls open', () => {
  let logger = fakeLogger();
  beforeEach(async () => {
    logger = fakeLogger();
    renderScreen({
      scannedBallotCount: 7,
      pollsInfo: mockPollsInfo('polls_open'),
      logger,
    });
    await screen.findByText('Do you want to close the polls?');
  });

  test('close polls happy path', async () => {
    apiMock.expectExportCastVoteRecordsToUsbDrive({ mode: 'polls_closing' });
    apiMock.expectTransitionPolls('close_polls');
    apiMock.expectPrintReport();
    userEvent.click(screen.getByText('Yes, Close the Polls'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls are closed.');
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.PollsClosed,
      'poll_worker',
      expect.objectContaining({
        disposition: 'success',
        scannedBallotCount: 7,
      })
    );
  });

  test('close polls from landing screen', async () => {
    apiMock.expectExportCastVoteRecordsToUsbDrive({ mode: 'polls_closing' });
    apiMock.expectTransitionPolls('close_polls');
    apiMock.expectPrintReport();
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Close Polls'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls are closed.');
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.PollsClosed,
      'poll_worker',
      expect.objectContaining({
        disposition: 'success',
        scannedBallotCount: 7,
      })
    );
  });

  test('pause voting', async () => {
    apiMock.expectTransitionPolls('pause_voting');
    apiMock.expectPrintReport();

    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Pause Voting'));
    await screen.findByText('Pausing Voting…');
    await screen.findByText('Voting paused.');
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.VotingPaused,
      'poll_worker',
      expect.objectContaining({
        disposition: 'success',
        scannedBallotCount: 7,
      })
    );
  });
});

describe('transitions from polls paused', () => {
  let logger = fakeLogger();
  beforeEach(async () => {
    logger = fakeLogger();
    renderScreen({
      scannedBallotCount: 7,
      pollsInfo: mockPollsInfo('polls_paused'),
      logger,
    });
    await screen.findByText('Do you want to resume voting?');
  });

  test('resume voting happy path', async () => {
    apiMock.expectTransitionPolls('resume_voting');
    apiMock.expectPrintReport();
    userEvent.click(screen.getByText('Yes, Resume Voting'));
    await screen.findByText('Resuming Voting…');
    await screen.findByText('Voting resumed.');
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.VotingResumed,
      'poll_worker',
      expect.objectContaining({
        disposition: 'success',
        scannedBallotCount: 7,
      })
    );
  });

  test('resume voting from landing screen', async () => {
    apiMock.expectTransitionPolls('resume_voting');
    apiMock.expectPrintReport();
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Resume Voting'));
    await screen.findByText('Resuming Voting…');
    await screen.findByText('Voting resumed.');
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.VotingResumed,
      'poll_worker',
      expect.objectContaining({
        disposition: 'success',
        scannedBallotCount: 7,
      })
    );
  });

  test('close polls from landing screen', async () => {
    apiMock.expectTransitionPolls('close_polls');
    apiMock.expectPrintReport();
    apiMock.expectExportCastVoteRecordsToUsbDrive({ mode: 'polls_closing' });
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Close Polls'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls are closed.');
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.PollsClosed,
      'poll_worker',
      expect.objectContaining({
        disposition: 'success',
        scannedBallotCount: 7,
      })
    );
  });
});

test('no transitions from polls closed final', async () => {
  renderScreen({
    scannedBallotCount: 0,
    pollsInfo: mockPollsInfo('polls_closed_final'),
  });
  await screen.findByText(
    'Voting is complete and the polls cannot be reopened.'
  );

  // There should only be the power down and print previous report button
  expect(screen.queryAllByRole('button')).toHaveLength(2);
  screen.getButton('Power Down');
  screen.getButton('Print Polls Closed Report');
});

// confirm that we have an alert and logging that meet VVSG 2.0 1.1.3-B
test('there is a warning if we attempt to open polls with ballots scanned', async () => {
  const logger = fakeLogger();
  renderScreen({
    scannedBallotCount: 1,
    pollsInfo: mockPollsInfo('polls_closed_initial'),
    logger,
  });
  await screen.findByText('Do you want to open the polls?');
  userEvent.click(screen.getByText('Yes, Open the Polls'));
  await screen.findByText('Ballots Already Scanned');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.PollsOpened,
    'poll_worker',
    expect.objectContaining({
      disposition: 'failure',
      scannedBallotCount: 1,
    })
  );
});

test('polls cannot be closed if CVR sync is required', async () => {
  apiMock.mockApiClient.getUsbDriveStatus.reset();
  apiMock.expectGetUsbDriveStatus('mounted', {
    doesUsbDriveRequireCastVoteRecordSync: true,
  });
  renderScreen({
    pollsInfo: mockPollsInfo('polls_open'),
    scannedBallotCount: 1,
  });

  // Try closing polls
  userEvent.click(
    await screen.findByRole('button', { name: 'Yes, Close the Polls' })
  );
  let modal = await screen.findByRole('alertdialog');
  within(modal).getByText(
    'Cast vote records (CVRs) need to be synced to the inserted USB drive before you can close polls. ' +
      'Remove your poll worker card to sync.'
  );
  userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );

  // Try closing polls from the secondary menu
  userEvent.click(screen.getByRole('button', { name: 'No' }));
  userEvent.click(await screen.findByRole('button', { name: 'Close Polls' }));
  modal = await screen.findByRole('alertdialog');
  within(modal).getByText(
    'Cast vote records (CVRs) need to be synced to the inserted USB drive before you can close polls. ' +
      'Remove your poll worker card to sync.'
  );
  userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});

test('polls cannot be closed if CVR sync is required, even from polls paused state', async () => {
  apiMock.mockApiClient.getUsbDriveStatus.reset();
  apiMock.expectGetUsbDriveStatus('mounted', {
    doesUsbDriveRequireCastVoteRecordSync: true,
  });
  renderScreen({
    pollsInfo: mockPollsInfo('polls_paused'),
    scannedBallotCount: 1,
  });

  // Try closing polls from the secondary menu
  userEvent.click(await screen.findByText('No'));
  userEvent.click(await screen.findByRole('button', { name: 'Close Polls' }));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText(
    'Cast vote records (CVRs) need to be synced to the inserted USB drive before you can close polls. ' +
      'Remove your poll worker card to sync.'
  );
  userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});

describe('reprinting previous report', () => {
  test('not available if no previous report', async () => {
    renderScreen({
      pollsInfo: mockPollsInfo('polls_closed_initial'),
    });

    userEvent.click(await screen.findByText('No'));
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Open Polls',
      'Power Down',
    ]);
  });

  test('available after polls open + can print additional afterward', async () => {
    renderScreen({
      pollsInfo: mockPollsInfo('polls_open'),
    });

    userEvent.click(await screen.findByText('No'));
    const button = await screen.findByText('Print Polls Opened Report');
    expect(button).toBeEnabled();
    apiMock.expectPrintReport();
    userEvent.click(button);
    apiMock.expectPrintReport();
    userEvent.click(
      await screen.findButton('Print Additional Polls Opened Report')
    );
    await screen.findButton('Print Additional Polls Opened Report');
  });

  test('available after polls paused', async () => {
    renderScreen({
      pollsInfo: mockPollsInfo('polls_paused'),
    });

    userEvent.click(await screen.findByText('No'));
    const button = await screen.findByText('Print Voting Paused Report');
    expect(button).toBeEnabled();
    apiMock.expectPrintReport();
    userEvent.click(button);
    await screen.findButton('Print Additional Voting Paused Report');
  });

  test('available after polls resumed', async () => {
    renderScreen({
      pollsInfo: mockPollsInfo('polls_open', { type: 'resume_voting' }),
    });

    userEvent.click(await screen.findByText('No'));
    const button = await screen.findByText('Print Voting Resumed Report');
    expect(button).toBeEnabled();
    apiMock.expectPrintReport();
    userEvent.click(button);
    await screen.findButton('Print Additional Voting Resumed Report');
  });

  test('available after polls closed', async () => {
    renderScreen({
      pollsInfo: mockPollsInfo('polls_closed_final'),
    });

    const button = await screen.findByText('Print Polls Closed Report');
    expect(button).toBeEnabled();
    apiMock.expectPrintReport();
    userEvent.click(button);
    await screen.findButton('Print Additional Polls Closed Report');
  });
});

describe('must have printer attached to transition polls and print reports', () => {
  test('polls open', async () => {
    renderScreen({
      pollsInfo: mockPollsInfo('polls_closed_initial'),
    });
    apiMock.setPrinterStatus({ connected: false });
    const attachText = await screen.findByText('Attach printer to continue.');
    expect(screen.getButton('Yes, Open the Polls')).toBeDisabled();

    apiMock.setPrinterStatus({ connected: true });
    await waitForElementToBeRemoved(attachText);
    apiMock.expectTransitionPolls('open_polls');
    apiMock.expectPrintReport();
    userEvent.click(screen.getByText('Yes, Open the Polls'));
    await screen.findByText('Print Additional Polls Opened Report');

    apiMock.setPrinterStatus({ connected: false });
    await waitFor(() => {
      expect(
        screen.getButton('Print Additional Polls Opened Report')
      ).toBeDisabled();
    });
  });

  test('additional reports', async () => {
    renderScreen({
      pollsInfo: mockPollsInfo('polls_closed_initial'),
    });

    apiMock.expectTransitionPolls('open_polls');
    apiMock.expectPrintReport();
    userEvent.click(await screen.findByText('Yes, Open the Polls'));
    expect(
      await screen.findByText('Print Additional Polls Opened Report')
    ).toBeEnabled();

    apiMock.setPrinterStatus({ connected: false });
    await waitFor(() => {
      expect(
        screen.getButton('Print Additional Polls Opened Report')
      ).toBeDisabled();
    });
  });

  test('polls close', async () => {
    renderScreen({
      pollsInfo: mockPollsInfo('polls_open'),
    });
    apiMock.setPrinterStatus({ connected: false });
    const attachText = await screen.findByText('Attach printer to continue.');
    expect(screen.getButton('Yes, Close the Polls')).toBeDisabled();

    apiMock.setPrinterStatus({ connected: true });
    await waitForElementToBeRemoved(attachText);
    apiMock.expectTransitionPolls('close_polls');
    apiMock.expectPrintReport();
    userEvent.click(screen.getByText('Yes, Close the Polls'));
    await screen.findByText('Print Additional Polls Closed Report');
  });
});
