import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import userEvent from '@testing-library/user-event';
import { waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryDefinition,
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
import { BROTHER_THERMAL_PRINTER_CONFIG } from '../../test/helpers/fixtures';

let apiMock: ApiMock;
let resetVoterSettingsMock: jest.Mock;

const featureFlagMock = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});

beforeEach(() => {
  featureFlagMock.resetFeatureFlags();
  resetVoterSettingsMock = jest.fn();
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

function renderScreen(props: Partial<PollWorkerScreenProps> = {}) {
  return render(
    provideApi(
      apiMock,
      <PollWorkerScreen
        electionDefinition={electionFamousNames2021Fixtures.electionDefinition}
        resetVoterSettings={resetVoterSettingsMock}
        scannedBallotCount={0}
        {...props}
      />
    )
  );
}

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
    expect(resetVoterSettingsMock).toHaveBeenCalledTimes(1);
  });

  test('close polls from landing screen', async () => {
    apiMock.expectClosePolls();
    apiMock.expectPrintReportV3();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Close Polls'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls are closed.');
    expect(resetVoterSettingsMock).toHaveBeenCalledTimes(1);
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
    expect(resetVoterSettingsMock).toHaveBeenCalledTimes(1);
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
  expect(screen.queryAllByRole('button')).toHaveLength(3);
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

describe('reprinting previous report', () => {
  test('not available if no previous report', async () => {
    apiMock.expectGetPollsInfo('polls_closed_initial');
    renderScreen({});

    userEvent.click(await screen.findByText('No'));
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Open Polls',
      'Hash Validation',
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
    apiMock.setPrinterStatusV4({ state: 'error', type: 'disconnected' });
    renderScreen({});

    const attachText = await screen.findByText('The printer is disconnected');
    expect(screen.getButton('Yes, Open the Polls')).toBeDisabled();
    apiMock.setPrinterStatusV4({ state: 'idle' });
    await waitForElementToBeRemoved(attachText);
    apiMock.expectOpenPolls();
    const { resolve } = apiMock.expectPrintReportV4();
    resolve();
    apiMock.expectGetPollsInfo('polls_open');
    userEvent.click(screen.getByText('Yes, Open the Polls'));
    await screen.findByText('Reprint Polls Opened Report');

    apiMock.setPrinterStatusV4({ state: 'error', type: 'disconnected' });
    await waitFor(() => {
      expect(screen.getButton('Reprint Polls Opened Report')).toBeDisabled();
    });
  });

  test('polls open from fallback screen', async () => {
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.setPrinterStatusV4({ state: 'error', type: 'disconnected' });
    renderScreen({});

    await screen.findByText('The printer is disconnected');

    // Go to screen with all options available
    userEvent.click(screen.getByText('No'));
    // Check that Open Polls is disabled
    expect(screen.getButton('Open Polls')).toBeDisabled();

    apiMock.setPrinterStatusV4({ state: 'idle' });
    apiMock.expectOpenPolls();
    const { resolve } = apiMock.expectPrintReportV4();
    resolve();
    apiMock.expectGetPollsInfo('polls_open');

    await waitFor(() => {
      expect(screen.getButton('Open Polls')).toBeEnabled();
    });

    userEvent.click(screen.getByText('Open Polls'));
    await screen.findByText('Reprint Polls Opened Report');

    apiMock.setPrinterStatusV4({ state: 'error', type: 'disconnected' });
    await waitFor(() => {
      expect(screen.getButton('Reprint Polls Opened Report')).toBeDisabled();
    });
  });

  test('additional reports', async () => {
    apiMock.setPrinterStatusV4({ state: 'idle' });
    apiMock.expectGetPollsInfo('polls_closed_initial');
    renderScreen({});

    apiMock.expectOpenPolls();
    const { resolve } = apiMock.expectPrintReportV4();
    resolve();
    apiMock.expectGetPollsInfo('polls_open');
    userEvent.click(await screen.findByText('Yes, Open the Polls'));
    expect(
      await screen.findByText('Reprint Polls Opened Report')
    ).toBeEnabled();

    apiMock.setPrinterStatusV4({ state: 'error', type: 'disconnected' });
    await waitFor(() => {
      expect(screen.getButton('Reprint Polls Opened Report')).toBeDisabled();
    });
  });

  test('polls close', async () => {
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.setPrinterStatusV4({ state: 'error', type: 'disconnected' });
    renderScreen({});

    const attachText = await screen.findByText('The printer is disconnected');
    expect(screen.getButton('Yes, Close the Polls')).toBeDisabled();

    apiMock.setPrinterStatusV4({ state: 'idle' });
    await waitForElementToBeRemoved(attachText);
    apiMock.expectClosePolls();
    const { resolve } = apiMock.expectPrintReportV4();
    resolve();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getByText('Yes, Close the Polls'));
    await screen.findByText('Reprint Polls Closed Report');
    expect(resetVoterSettingsMock).toHaveBeenCalledTimes(1);
  });

  test('polls close from fallback screen', async () => {
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.setPrinterStatusV4({ state: 'error', type: 'disconnected' });
    renderScreen({});
    await screen.findByText('The printer is disconnected');

    userEvent.click(screen.getByText('No'));

    expect(screen.getButton('Close Polls')).toBeDisabled();

    apiMock.setPrinterStatusV4({ state: 'idle' });
    await waitFor(() => {
      expect(screen.getButton('Close Polls')).toBeEnabled();
    });

    apiMock.expectClosePolls();
    const { resolve } = apiMock.expectPrintReportV4();
    resolve();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getByText('Close Polls'));
    await screen.findByText('Reprint Polls Closed Report');
    expect(resetVoterSettingsMock).toHaveBeenCalledTimes(1);
  });
});

describe('must have usb drive attached to transition polls', () => {
  test('polls open', async () => {
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.setPrinterStatusV3({ connected: true });
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});

    const attachText = await screen.findByText('Insert USB drive to continue.');
    expect(screen.getButton('Yes, Open the Polls')).toBeDisabled();
    apiMock.expectGetUsbDriveStatus('mounted');
    await waitForElementToBeRemoved(attachText);
    apiMock.expectOpenPolls();
    apiMock.expectPrintReportV3();
    apiMock.expectGetPollsInfo('polls_open');
    userEvent.click(screen.getByText('Yes, Open the Polls'));
    await screen.findByText('Print Additional Polls Opened Report');
  });

  test('polls open from fallback screen', async () => {
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.setPrinterStatusV3({ connected: true });
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});

    await screen.findByText('Insert USB drive to continue.');

    // Go to screen with all options available
    userEvent.click(screen.getByText('No'));
    // Check that Open Polls is disabled
    expect(screen.getButton('Open Polls')).toBeDisabled();

    apiMock.expectGetUsbDriveStatus('mounted');
    apiMock.expectOpenPolls();
    apiMock.expectPrintReportV3();
    apiMock.expectGetPollsInfo('polls_open');

    await waitFor(() => {
      expect(screen.getButton('Open Polls')).toBeEnabled();
    });

    userEvent.click(screen.getByText('Open Polls'));
    await screen.findByText('Print Additional Polls Opened Report');
  });

  test('polls paused', async () => {
    apiMock.expectGetPollsInfo('polls_paused');
    apiMock.setPrinterStatusV3({ connected: true });
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});

    const attachText = await screen.findByText('Insert USB drive to continue.');
    expect(screen.getButton('Yes, Resume Voting')).toBeDisabled();

    apiMock.expectGetUsbDriveStatus('mounted');
    await waitForElementToBeRemoved(attachText);
    apiMock.expectResumeVoting();
    apiMock.expectPrintReportV3();
    apiMock.expectGetPollsInfo('polls_open');
    userEvent.click(screen.getByText('Yes, Resume Voting'));
    await screen.findByText('Voting resumed.');
  });

  test('polls paused from fallback screen', async () => {
    apiMock.expectGetPollsInfo('polls_paused');
    apiMock.setPrinterStatusV3({ connected: true });
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});

    await screen.findByText('Insert USB drive to continue.');
    userEvent.click(screen.getByText('No'));

    expect(screen.getButton('Resume Voting')).toBeDisabled();
    expect(screen.getButton('Close Polls')).toBeDisabled();

    apiMock.expectGetUsbDriveStatus('mounted');

    await waitFor(() => {
      expect(screen.getButton('Resume Voting')).toBeEnabled();
      expect(screen.getButton('Close Polls')).toBeEnabled();
    });
    apiMock.expectClosePolls();
    apiMock.expectPrintReportV3();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getByText('Close Polls'));
    await screen.findByText('Print Additional Polls Closed Report');
  });

  test('polls close', async () => {
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.setPrinterStatusV3({ connected: true });
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});

    const attachText = await screen.findByText('Insert USB drive to continue.');
    expect(screen.getButton('Yes, Close the Polls')).toBeDisabled();

    apiMock.expectGetUsbDriveStatus('mounted');
    await waitForElementToBeRemoved(attachText);
    apiMock.expectClosePolls();
    apiMock.expectPrintReportV3();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getByText('Yes, Close the Polls'));
    await screen.findByText('Print Additional Polls Closed Report');
    expect(resetVoterSettingsMock).toHaveBeenCalledTimes(1);
  });

  test('polls close from fallback screen', async () => {
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.setPrinterStatusV3({ connected: true });
    apiMock.expectGetUsbDriveStatus('no_drive');
    renderScreen({});
    await screen.findByText('Insert USB drive to continue.');

    userEvent.click(screen.getByText('No'));

    expect(screen.getButton('Close Polls')).toBeDisabled();
    // Allow pausing in unexpected situations.
    expect(screen.getButton('Pause Voting')).toBeEnabled();

    apiMock.expectGetUsbDriveStatus('mounted');
    await waitFor(() => {
      expect(screen.getButton('Close Polls')).toBeEnabled();
    });

    apiMock.expectClosePolls();
    apiMock.expectPrintReportV3();
    apiMock.expectGetPollsInfo('polls_closed_final');
    userEvent.click(screen.getByText('Close Polls'));
    await screen.findByText('Print Additional Polls Closed Report');
    expect(resetVoterSettingsMock).toHaveBeenCalledTimes(1);
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

    // continue printing third page
    const { resolve: resolveNonpartisan } = apiMock.expectPrintReportSection(2);
    userEvent.click(screen.getButton('Print Next'));
    await screen.findByText('Printing Report…');
    resolveNonpartisan();
    await screen.findByText('Polls are open.');
    screen.getByText(/Nonpartisan Contests Polls Opened Report/);
    screen.getByText(/Remove the poll worker card/);

    // you can reprint last page too
    const { resolve: resolveFishReprint } = apiMock.expectPrintReportSection(2);
    userEvent.click(screen.getButton('Reprint Previous'));
    await screen.findByText('Printing Report…');
    resolveFishReprint();
    await screen.findByText('Polls are open.');
    screen.getByText(/Nonpartisan Contests Polls Opened Report/);

    // try reprinting all the pages
    const { resolve: resolveMammalReprint2 } =
      apiMock.expectPrintReportSection(0);
    userEvent.click(screen.getButton('Reprint All'));
    await screen.findByText('Printing Report…');
    resolveMammalReprint2();
    await screen.findByText('Polls are open.');
    screen.getByText(/Mammal Party Polls Opened Report/);
  });

  test('suspension report printing happy path, for primary', async () => {
    apiMock.setPrinterStatusV4();
    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({
      electionDefinition: electionTwoPartyPrimaryDefinition,
    });

    // pause voting flow
    await screen.findByText('Do you want to close the polls?');
    userEvent.click(screen.getByText('No'));
    apiMock.expectGetPollsInfo('polls_paused');
    apiMock.expectPauseVoting();
    const { resolve: resolveReport } = apiMock.expectPrintReportV4();
    userEvent.click(screen.getButton('Pause Voting'));
    await screen.findByText('Pausing Voting…');
    resolveReport();
    await screen.findByText('Voting paused.');
    screen.getByText(/Voting Paused Report/);

    // reprinting flow
    expect(screen.getAllByRole('button')).toHaveLength(1); // only one reprint button
    const { resolve: resolveReprintReport } =
      apiMock.expectPrintReportSection(0);
    userEvent.click(screen.getButton('Reprint Voting Paused Report'));
    resolveReprintReport();
    await screen.findByText('Voting paused.');
    screen.getByText(/Voting Paused Report/);
    expect(screen.getAllByRole('button')).toHaveLength(1); // still only one reprint button
    screen.getButton('Reprint Voting Paused Report');
  });

  test('out of paper while printing, reload, reprint', async () => {
    apiMock.setPrinterStatusV4();
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.expectOpenPolls();

    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({
      electionDefinition: electionTwoPartyPrimaryDefinition,
    });

    // close polls but fail the print
    await screen.findByText('Do you want to open the polls?');
    const { resolve } = apiMock.expectPrintReportV4({ state: 'no-paper' });
    apiMock.setPrinterStatusV4({ state: 'no-paper' });
    userEvent.click(screen.getByText('Yes, Open the Polls'));
    await screen.findByText('Opening Polls…');
    resolve();
    await screen.findByText('Printing Stopped');
    screen.getByText(/out of paper/);

    // reloading flow
    userEvent.click(await screen.findButton('Load Paper'));
    await screen.findByRole('alertdialog');
    screen.getByText('Remove Paper Roll Holder');

    apiMock.setPrinterStatusV4({ state: 'cover-open' });
    await screen.findByText('Load New Paper Roll');

    apiMock.setPrinterStatusV4({ state: 'idle' });
    await screen.findByText('Paper Loaded');

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
    await screen.findByText('Polls are open.');
    screen.getByText(/Mammal Party Polls Opened Report/);
  });

  test('printer error while printing', async () => {
    apiMock.setPrinterStatusV4();
    apiMock.expectGetPollsInfo('polls_closed_initial');
    apiMock.expectOpenPolls();
    apiMock.expectGetPollsInfo('polls_open');
    renderScreen({
      electionDefinition: electionTwoPartyPrimaryDefinition,
    });

    // close polls but fail the print
    await screen.findByText('Do you want to open the polls?');
    const { resolve } = apiMock.expectPrintReportV4({
      state: 'error',
      type: 'disconnected',
    });
    userEvent.click(screen.getByText('Yes, Open the Polls'));
    await screen.findByText('Opening Polls…');
    resolve();
    await screen.findByText('Printing Stopped');
    screen.getByText(/unexpected error/);
  });

  test.each<PollsState>(['polls_closed_initial', 'polls_paused', 'polls_open'])(
    'printer status messages show on flow screen: %s',
    async (state) => {
      apiMock.setPrinterStatusV4({ state: 'error', type: 'disconnected' });
      apiMock.expectGetPollsInfo(state);
      renderScreen({
        electionDefinition: electionTwoPartyPrimaryDefinition,
      });

      await screen.findByText('The printer is disconnected');
      expect(screen.getButton(/Yes/)).toBeDisabled();
    }
  );

  test('poll worker menu supports loading printer paper flow', async () => {
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.setPrinterStatusV4({ state: 'no-paper' });
    renderScreen({});

    userEvent.click(await screen.findByText('No'));
    userEvent.click(await screen.findByText('Load Printer Paper'));
    await screen.findByText('Remove Paper Roll Holder');
  });

  test('if printer is loaded, poll worker menu shows reprint button as normal', async () => {
    apiMock.expectGetPollsInfo('polls_open');
    apiMock.setPrinterStatusV4({ state: 'idle' });
    renderScreen({});

    userEvent.click(await screen.findByText('No'));
    const { resolve } = apiMock.expectPrintReportV4();
    userEvent.click(await screen.findButton('Print Polls Opened Report'));
    resolve();
    await screen.findButton('Reprint Polls Opened Report');
  });
});

test('Signed hash validation', async () => {
  apiMock.expectGetPollsInfo('polls_open');
  renderScreen({});

  userEvent.click(await screen.findByText('No'));
  expect(screen.queryByText('Hash Validation')).toBeTruthy();

  apiMock.expectGenerateSignedHashValidationQrCodeValue();
  userEvent.click(screen.getByText('Hash Validation'));
  await screen.findByText('Done');
});
