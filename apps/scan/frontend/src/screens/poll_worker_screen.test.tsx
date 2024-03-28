import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import userEvent from '@testing-library/user-event';
import {
  waitFor,
  waitForElementToBeRemoved,
  within,
} from '@testing-library/react';
import { BROTHER_THERMAL_PRINTER_CONFIG } from '@votingworks/printing';
import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { err } from '@votingworks/basics';
import { screen, RenderResult, render } from '../../test/react_testing_library';
import { PollWorkerScreen, PollWorkerScreenProps } from './poll_worker_screen';
import {
  ApiMock,
  createApiMock,
  provideApi,
  statusNoPaper,
} from '../../test/helpers/mock_api_client';

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
  apiMock.setPrinterStatusV3({
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
        electionDefinition={electionFamousNames2021Fixtures.electionDefinition}
        scannedBallotCount={0}
        {...props}
      />
    )
  );
}

describe('shows Livecheck button only when enabled', () => {
  test('enable livecheck', async () => {
    featureFlagMock.enableFeatureFlag(BooleanEnvironmentVariableName.LIVECHECK);

    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({
      scannedBallotCount: 5,
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

    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({
      scannedBallotCount: 5,
    });

    userEvent.click(await screen.findByText('No'));
    expect(screen.queryByText('Live Check')).toBeFalsy();
  });
});

describe('transitions from polls closed initial', () => {
  beforeEach(async () => {
    apiMock.expectGetPollsInfo('polls_closed_initial');
    renderScreen({
      scannedBallotCount: 0,
    });
    await screen.findByText('Do you want to open the polls?');
  });

  test('open polls happy path', async () => {
    apiMock.expectOpenPolls();
    apiMock.expectPrintReportV3();
    apiMock.expectGetPollsInfo('polls_open');
    userEvent.click(screen.getByText('Yes, Open the Polls'));
    await screen.findByText('Opening Polls…');
    await screen.findByText('Polls are open.');
  });

  test('open polls from landing screen', async () => {
    apiMock.expectOpenPolls();
    apiMock.expectPrintReportV3();
    apiMock.expectGetPollsInfo('polls_open');
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Open Polls'));
    await screen.findByText('Opening Polls…');
    await screen.findByText('Polls are open.');
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
    apiMock.expectPrintReportV3();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getByText('Yes, Close the Polls'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls are closed.');
  });

  test('close polls from landing screen', async () => {
    apiMock.expectClosePolls();
    apiMock.expectPrintReportV3();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Close Polls'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls are closed.');
  });

  test('pause voting', async () => {
    apiMock.expectPauseVoting();
    apiMock.expectPrintReportV3();
    apiMock.expectGetPollsInfo('polls_paused');
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Pause Voting'));
    await screen.findByText('Pausing Voting…');
    await screen.findByText('Voting paused.');
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
    apiMock.expectPrintReportV3();
    apiMock.expectGetPollsInfo('polls_open', { type: 'resume_voting' });
    userEvent.click(screen.getByText('Yes, Resume Voting'));
    await screen.findByText('Resuming Voting…');
    await screen.findByText('Voting resumed.');
  });

  test('resume voting from landing screen', async () => {
    apiMock.expectResumeVoting();
    apiMock.expectPrintReportV3();
    apiMock.expectGetPollsInfo('polls_open', { type: 'resume_voting' });
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Resume Voting'));
    await screen.findByText('Resuming Voting…');
    await screen.findByText('Voting resumed.');
  });

  test('close polls from landing screen', async () => {
    apiMock.expectClosePolls();
    apiMock.expectPrintReportV3();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Close Polls'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls are closed.');
  });
});

test('no transitions from polls closed final', async () => {
  apiMock.expectGetPollsInfo('polls_closed_final');
  renderScreen({
    scannedBallotCount: 0,
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
  apiMock.expectGetPollsInfo('polls_closed_initial');
  renderScreen({
    scannedBallotCount: 1,
  });
  await screen.findByText('Do you want to open the polls?');
  apiMock.expectOpenPolls(err('ballots-already-scanned'));
  apiMock.expectGetPollsInfo('polls_closed_initial');
  userEvent.click(screen.getByText('Yes, Open the Polls'));
  await screen.findByText('Ballots Already Scanned');
});

test('polls cannot be closed if CVR sync is required', async () => {
  apiMock.mockApiClient.getUsbDriveStatus.reset();
  apiMock.expectGetUsbDriveStatus('mounted', {
    doesUsbDriveRequireCastVoteRecordSync: true,
  });
  apiMock.expectGetPollsInfo('polls_open');
  renderScreen({
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
  apiMock.expectGetPollsInfo('polls_paused');
  renderScreen({
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
    apiMock.expectGetPollsInfo('polls_closed_initial');
    renderScreen({});

    userEvent.click(await screen.findByText('No'));
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Open Polls',
      'Power Down',
    ]);
  });

  test('available after polls open + can print additional afterward', async () => {
    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({});

    userEvent.click(await screen.findByText('No'));
    const button = await screen.findByText('Print Polls Opened Report');
    expect(button).toBeEnabled();
    apiMock.expectPrintReportV3();
    userEvent.click(button);
    apiMock.expectPrintReportV3();
    userEvent.click(
      await screen.findButton('Print Additional Polls Opened Report')
    );
    await screen.findButton('Print Additional Polls Opened Report');
  });

  test('available after polls paused', async () => {
    apiMock.expectGetPollsInfo('polls_paused');
    renderScreen({});

    userEvent.click(await screen.findByText('No'));
    const button = await screen.findByText('Print Voting Paused Report');
    expect(button).toBeEnabled();
    apiMock.expectPrintReportV3();
    userEvent.click(button);
    await screen.findButton('Print Additional Voting Paused Report');
  });

  test('available after polls resumed', async () => {
    apiMock.expectGetPollsInfo('polls_open', { type: 'resume_voting' });
    renderScreen({});

    userEvent.click(await screen.findByText('No'));
    const button = await screen.findByText('Print Voting Resumed Report');
    expect(button).toBeEnabled();
    apiMock.expectPrintReportV3();
    userEvent.click(button);
    await screen.findButton('Print Additional Voting Resumed Report');
  });

  test('available after polls closed', async () => {
    apiMock.expectGetPollsInfo('polls_closed_final');
    renderScreen({});

    const button = await screen.findByText('Print Polls Closed Report');
    expect(button).toBeEnabled();
    apiMock.expectPrintReportV3();
    userEvent.click(button);
    await screen.findButton('Print Additional Polls Closed Report');
  });
});

describe('must have printer attached to transition polls and print reports', () => {
  test('polls open', async () => {
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.setPrinterStatusV3({ connected: false });
    renderScreen({});

    const attachText = await screen.findByText('Attach printer to continue.');
    expect(screen.getButton('Yes, Open the Polls')).toBeDisabled();
    apiMock.setPrinterStatusV3({ connected: true });
    await waitForElementToBeRemoved(attachText);
    apiMock.expectOpenPolls();
    apiMock.expectPrintReportV3();
    apiMock.expectGetPollsInfo('polls_open');
    userEvent.click(screen.getByText('Yes, Open the Polls'));
    await screen.findByText('Print Additional Polls Opened Report');

    apiMock.setPrinterStatusV3({ connected: false });
    await waitFor(() => {
      expect(
        screen.getButton('Print Additional Polls Opened Report')
      ).toBeDisabled();
    });
  });

  test('additional reports', async () => {
    apiMock.expectGetPollsInfo('polls_closed_initial');
    renderScreen({});

    apiMock.expectOpenPolls();
    apiMock.expectPrintReportV3();
    apiMock.expectGetPollsInfo('polls_open');
    userEvent.click(await screen.findByText('Yes, Open the Polls'));
    expect(
      await screen.findByText('Print Additional Polls Opened Report')
    ).toBeEnabled();

    apiMock.setPrinterStatusV3({ connected: false });
    await waitFor(() => {
      expect(
        screen.getButton('Print Additional Polls Opened Report')
      ).toBeDisabled();
    });
  });

  test('polls close', async () => {
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.setPrinterStatusV3({ connected: false });
    renderScreen({});

    const attachText = await screen.findByText('Attach printer to continue.');
    expect(screen.getButton('Yes, Close the Polls')).toBeDisabled();

    apiMock.setPrinterStatusV3({ connected: true });
    await waitForElementToBeRemoved(attachText);
    apiMock.expectClosePolls();
    apiMock.expectPrintReportV3();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getByText('Yes, Close the Polls'));
    await screen.findByText('Print Additional Polls Closed Report');
  });
});

describe('hardware V4 report printing', () => {
  test('single report printing happy path', async () => {
    apiMock.setPrinterStatusV4();
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.expectOpenPolls();
    const { resolve } = apiMock.expectPrintReportV4();
    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({
      electionDefinition: electionFamousNames2021Fixtures.electionDefinition,
    });

    // close polls to trigger first section to print
    await screen.findByText('Do you want to open the polls?');
    userEvent.click(screen.getByText('Yes, Open the Polls'));
    await screen.findByText('Opening Polls…');
    resolve();
    await screen.findByText('Polls are open.');
    screen.getByText(
      'Report printed. Remove the poll worker card once you have printed all necessary reports.'
    );

    // try reprinting that report
    const { resolve: resolveReprint } = apiMock.expectPrintReportSection(0);
    userEvent.click(screen.getButton('Reprint Polls Opened Report'));
    await screen.findByText('Printing Report…');
    resolveReprint();
    await screen.findByText('Polls are open.');
    screen.getByText(
      'Report printed. Remove the poll worker card once you have printed all necessary reports.'
    );
  });

  test('multiple report printing happy path', async () => {
    apiMock.setPrinterStatusV4();
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.expectOpenPolls();
    const { resolve: resolveMammal } = apiMock.expectPrintReportV4();
    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({
      electionDefinition: electionTwoPartyPrimaryDefinition,
    });

    // close polls to trigger first section to print
    await screen.findByText('Do you want to open the polls?');
    userEvent.click(screen.getByText('Yes, Open the Polls'));
    await screen.findByText('Opening Polls…');
    resolveMammal();
    await screen.findByText('Polls are open.');
    screen.getByText(/Mammal Party Polls Opened Report/);

    // try reprinting that report, landing on same page
    const { resolve: resolveMammalReprint } =
      apiMock.expectPrintReportSection(0);
    userEvent.click(screen.getButton('Reprint Previous'));
    await screen.findByText('Printing Report…');
    resolveMammalReprint();
    await screen.findByText('Polls are open.');
    screen.getByText(/Mammal Party Polls Opened Report/);

    // continue printing second page
    const { resolve: resolveFish } = apiMock.expectPrintReportSection(1);
    userEvent.click(screen.getButton('Print Next'));
    await screen.findByText('Printing Report…');
    resolveFish();
    await screen.findByText('Polls are open.');
    screen.getByText(/Fish Party Polls Opened Report/);

    // you can reprint second page too
    const { resolve: resolveFishReprint } = apiMock.expectPrintReportSection(1);
    userEvent.click(screen.getButton('Reprint Previous'));
    await screen.findByText('Printing Report…');
    resolveFishReprint();
    await screen.findByText('Polls are open.');
    screen.getByText(/Fish Party Polls Opened Report/);

    // continue printing third page
    const { resolve: resolveNonpartisan } = apiMock.expectPrintReportSection(2);
    userEvent.click(screen.getButton('Print Next'));
    await screen.findByText('Printing Report…');
    resolveNonpartisan();
    await screen.findByText('Polls are open.');
    screen.getByText(/Nonpartisan Contests Polls Opened Report/);
    screen.getByText(/Remove the poll worker card/);

    // try reprinting from beginning
    const { resolve: resolveMammalReprint2 } =
      apiMock.expectPrintReportSection(0);
    userEvent.click(screen.getButton('Reprint All'));
    await screen.findByText('Printing Report…');
    resolveMammalReprint2();
    await screen.findByText('Polls are open.');
    screen.getByText(/Mammal Party Polls Opened Report/);
  });

  test('out of paper while printing', async () => {
    apiMock.setPrinterStatusV4();
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.expectOpenPolls();
    const { resolve } = apiMock.expectPrintReportV4({ state: 'no-paper' });
    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({
      electionDefinition: electionTwoPartyPrimaryDefinition,
    });

    // close polls but fail the print
    await screen.findByText('Do you want to open the polls?');
    userEvent.click(screen.getByText('Yes, Open the Polls'));
    await screen.findByText('Opening Polls…');
    resolve();
    await screen.findByText('Printing Stopped');
    screen.getByText(/out of paper/);
  });

  test('printer error while printing', async () => {
    apiMock.setPrinterStatusV4();
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.expectOpenPolls();
    const { resolve } = apiMock.expectPrintReportV4({ state: 'cover-open' });
    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({
      electionDefinition: electionTwoPartyPrimaryDefinition,
    });

    // close polls but fail the print
    await screen.findByText('Do you want to open the polls?');
    userEvent.click(screen.getByText('Yes, Open the Polls'));
    await screen.findByText('Opening Polls…');
    resolve();
    await screen.findByText('Printing Stopped');
    screen.getByText(/unexpected error/);
  });
});
