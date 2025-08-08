import { describe, test, beforeEach, afterEach, vi, expect } from 'vitest';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import {
  PollbookConnectionStatus,
  PollbookServiceInfo,
} from '@votingworks/pollbook-backend';
import { within } from '@testing-library/react';
import { screen } from '../test/react_testing_library';
import { ApiMock, createApiMock } from '../test/mock_api_client';
import { SystemAdministratorScreen } from './system_administrator_screen';
import { renderInAppContext } from '../test/render_in_app_context';

const nonbreakingHyphen = '‑';

let apiMock: ApiMock;
const electionFamousNames = electionFamousNames2021Fixtures.readElection();
const electionDefFamousNames =
  electionFamousNames2021Fixtures.readElectionDefinition();

const mockPollbookService: PollbookServiceInfo = {
  electionId: electionFamousNames.id,
  electionBallotHash: electionDefFamousNames.ballotHash,
  pollbookPackageHash: 'test-pollbook-hash',
  electionTitle: 'Test Election',
  machineId: 'TEST',
  lastSeen: new Date('2025-01-01'),
  status: PollbookConnectionStatus.MismatchedConfiguration,
  numCheckIns: 0,
  codeVersion: 'test',
};

let unmount: () => void;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
  apiMock = createApiMock();
  apiMock.expectGetDeviceStatuses();
});

describe('Election tab', () => {
  afterEach(() => {
    apiMock.mockApiClient.assertComplete();
    unmount();
  });
  test('basic render', async () => {
    apiMock.setIsAbsenteeMode(false);
    apiMock.expectHaveElectionEventsOccurred(false);
    apiMock.setElection(electionDefFamousNames);
    const renderResult = renderInAppContext(<SystemAdministratorScreen />, {
      apiMock,
    });
    unmount = renderResult.unmount;

    await screen.findByRole('heading', { name: 'Election' });
  });

  test('sys admin - renders UnconfiguredScreen when election is unconfigured and not connected to other machines', async () => {
    apiMock.setElection(undefined);
    const renderResult = renderInAppContext(<SystemAdministratorScreen />, {
      apiMock,
    });
    unmount = renderResult.unmount;
    await screen.findByRole('heading', { name: 'Election' });
    await screen.findByText(
      'Insert a USB drive containing a poll book package or power up another configured machine.'
    );
  });

  test('sys admin - can configure from usb', async () => {
    apiMock.setElection(undefined);
    const renderResult = renderInAppContext(<SystemAdministratorScreen />, {
      apiMock,
    });
    unmount = renderResult.unmount;
    await screen.findByRole('heading', { name: 'Election' });
    await screen.findByText(
      'Insert a USB drive containing a poll book package or power up another configured machine.'
    );

    apiMock.setElectionConfiguration('not-found-usb');
    await screen.findByText(
      'No poll book package found on the inserted USB drive.'
    );

    // There should be a error if there was an error in configuration from usb
    apiMock.setElectionConfiguration('usb-configuration-error');
    await screen.findByText('Failed to configure VxPollBook');

    apiMock.setElectionConfiguration('loading');
    await screen.findByText('Configuring VxPollBook from USB drive…');
  });

  test('sys admin - can configure from networked machine', async () => {
    apiMock.setNetworkOnline([
      {
        ...mockPollbookService,
        machineId: 'TEST-01',
        status: PollbookConnectionStatus.MismatchedConfiguration,
      },
      {
        ...mockPollbookService,
        machineId: 'TEST-02',
        status: PollbookConnectionStatus.ShutDown,
      },
      {
        ...mockPollbookService,
        machineId: 'TEST-03',
        status: PollbookConnectionStatus.LostConnection,
      },
      {
        ...mockPollbookService,
        machineId: 'TEST-04',
        status: PollbookConnectionStatus.MismatchedConfiguration,
        pollbookPackageHash: 'different-pollbook-hash',
        electionTitle: 'Bad Election',
      },
    ]);
    apiMock.setElection(undefined);
    const renderResult = renderInAppContext(<SystemAdministratorScreen />, {
      apiMock,
    });
    unmount = renderResult.unmount;
    await screen.findByRole('heading', { name: 'Election' });
    const rows = screen.getAllByTestId('pollbook-config-row');
    expect(rows).toHaveLength(2);
    screen.debug(rows[0], Infinity);
    await within(rows[0]).findByText('Test Election');
    // Only TEST-01 should show as a machineId as the 02 and 03 are offline
    await within(rows[0]).findByText(`TEST${nonbreakingHyphen}01`);
    await within(rows[0]).findByText(
      `${electionDefFamousNames.ballotHash.slice(0, 7)}-test-po`
    );
    await within(rows[1]).findByText('Bad Election');
    await within(rows[1]).findByText(`TEST${nonbreakingHyphen}04`);
    await within(rows[1]).findByText(
      `${electionDefFamousNames.ballotHash.slice(0, 7)}-differe`
    );
    await screen.findByText(
      /Insert a USB drive containing a poll book package, or configure from another nearby machine listed below./
    );

    // If the usb drive is inserted without a package there is a warning.
    apiMock.setElectionConfiguration('not-found-usb');
    await screen.findByText(
      /No poll book package found on the inserted USB drive/
    );

    // There should be a warning if there was an error in configuration from usb
    apiMock.setElectionConfiguration('usb-configuration-error');
    await screen.findByText(/Error during configuration/);

    // Try to configure from the "bad" election and mimic an error
    apiMock.expectConfigureOverNetwork('TEST-04', 'invalid-pollbook-package');
    const configureBad = await within(rows[1]).findByText('Configure');
    userEvent.click(configureBad);
    await screen.findByText(/Error during configuration. Please try again./);

    // Try to configure from the "good" election and mimic success
    apiMock.expectConfigureOverNetwork('TEST-01');
    const configureGood = await within(rows[0]).findByText('Configure');
    userEvent.click(configureGood);
  });

  test('shows precinct select and allows changing configured precinct', async () => {
    apiMock.setIsAbsenteeMode(false);
    apiMock.expectHaveElectionEventsOccurred(false);
    apiMock.setElection(electionDefFamousNames);

    const { precincts } = electionDefFamousNames.election;
    const renderResult = renderInAppContext(<SystemAdministratorScreen />, {
      apiMock,
    });
    unmount = renderResult.unmount;

    // Wait for the SearchSelect to appear with the correct value
    const select = await screen.findByLabelText('Select Precinct');
    expect(select).toBeInTheDocument();
    expect(select.ariaDisabled).toBeFalsy();
    // Should have the correct initial value
    expect((select as HTMLSelectElement).value).toEqual('');

    // Simulate changing the precinct
    const newPrecinctId = precincts[1].id;

    apiMock.expectSetConfiguredPrecinct(newPrecinctId);

    userEvent.click(screen.getByText('Select Precinct…'));
    userEvent.click(screen.getByText(precincts[1].name));

    // Wait for the value to update
    await vi.waitFor(() => {
      screen.getByText(precincts[1].name);
    });
  });
});

describe('Settings tab', () => {
  async function renderSettingsTab() {
    const renderResult = renderInAppContext(<SystemAdministratorScreen />, {
      apiMock,
    });
    unmount = renderResult.unmount;

    const settingsTabButton = await screen.findByRole('button', {
      name: 'Settings',
    });
    userEvent.click(settingsTabButton);

    await screen.findByRole('heading', { name: 'Settings' });
  }

  beforeEach(() => {
    apiMock.setIsAbsenteeMode(false);
    apiMock.setElection(electionDefFamousNames);
    apiMock.expectHaveElectionEventsOccurred(false);
    apiMock.expectGetUsbDriveStatus({
      status: 'mounted',
      mountPoint: '/dev/null',
    });
  });

  afterEach(() => {
    unmount();
  });

  test('basic render', async () => {
    await renderSettingsTab();
  });

  test('save logs button', async () => {
    await renderSettingsTab();

    // Full functionality tested in libs/ui/src/export_logs_modal.test.tsx
    userEvent.click(screen.getByRole('button', { name: 'Save Logs' }));
    await screen.findByRole('heading', { name: 'Save Logs' });
    screen.getByText('Select a log format:');
  });

  test('set date and time button', async () => {
    await renderSettingsTab();

    // Full functionality tested in libs/ui/src/set_clock.test.tsx
    userEvent.click(screen.getByRole('button', { name: 'Set Date and Time' }));
    await screen.findByRole('heading', { name: 'Set Date and Time' });
  });

  test('format USB drive button', async () => {
    await renderSettingsTab();

    // Full functionality tested in libs/ui/src/format_usb_modal.test.tsx
    userEvent.click(screen.getByRole('button', { name: 'Format USB Drive' }));
    await screen.findByRole('heading', { name: 'Format USB Drive' });
    await screen.findByText(
      'Formatting will delete all files on the USB drive. Back up USB drive files before formatting.'
    );
  });
});
