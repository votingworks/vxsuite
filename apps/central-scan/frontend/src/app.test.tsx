import fetchMock from 'fetch-mock';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import {
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
  fakeSystemAdministratorUser,
  hasTextAcrossElements,
  suppressingConsoleOutput,
} from '@votingworks/test-utils';
import { MemoryHardware } from '@votingworks/utils';
import { typedAs } from '@votingworks/basics';
import { Scan } from '@votingworks/api';
import {
  DEFAULT_SYSTEM_SETTINGS,
  ElectionDefinition,
} from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { render, waitFor, within, screen } from '../test/react_testing_library';
import { App } from './app';
import { ApiMock, createApiMock } from '../test/api';

let apiMock: ApiMock;

beforeEach(() => {
  jest.restoreAllMocks();

  apiMock = createApiMock();
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  apiMock.setUsbDriveStatus({
    status: 'no_drive',
  });
  apiMock.expectGetSystemSettings();
  apiMock.expectGetMachineConfig();

  fetchMock.config.fallbackToNetwork = true;
  fetchMock.get(
    '/central-scanner/scan/status',
    typedAs<Scan.GetScanStatusResponse>({
      canUnconfigure: true,
      batches: [],
      adjudication: { adjudicated: 0, remaining: 0 },
    }),
    { overwriteRoutes: true }
  );

  const oldWindowLocation = window.location;
  Object.defineProperty(window, 'location', {
    value: {
      ...oldWindowLocation,
      href: '/',
    },
    configurable: true,
  });
});

afterEach(() => {
  apiMock.assertComplete();
  expect(fetchMock.done()).toEqual(true);
  expect(fetchMock.calls('unmatched')).toEqual([]);
});

function expectConfigureFromElectionPackageOnUsbDrive() {
  apiMock.expectConfigure(electionGeneralDefinition);
  apiMock.expectGetSystemSettings(DEFAULT_SYSTEM_SETTINGS);
  apiMock.expectGetElectionDefinition(electionGeneralDefinition);
}

export async function authenticateAsSystemAdministrator(
  lockScreenText = 'VxCentralScan is Locked'
): Promise<void> {
  // First verify that we're logged out
  await screen.findByText(lockScreenText);

  apiMock.setAuthStatus({
    status: 'logged_in',
    user: fakeSystemAdministratorUser(),
    sessionExpiresAt: fakeSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  });
  await screen.findByText('Lock Machine');
}

export async function authenticateAsElectionManager(
  electionDefinition: ElectionDefinition,
  lockScreenText = 'VxCentralScan is Locked',
  postAuthText = 'Lock Machine'
): Promise<void> {
  // First verify that we're logged out
  await screen.findByText(lockScreenText);

  apiMock.setAuthStatus({
    status: 'logged_in',
    user: fakeElectionManagerUser({
      electionHash: electionDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  });
  await screen.findByText(postAuthText);
}

test('renders without crashing', async () => {
  apiMock.expectGetTestMode(true);
  apiMock.expectGetElectionDefinition(electionGeneralDefinition);

  const hardware = MemoryHardware.buildStandard();
  render(<App apiClient={apiMock.apiClient} hardware={hardware} />);
  await waitFor(() => fetchMock.called());
});

test('shows a "test ballot mode" button if the app is in Official Ballot Mode', async () => {
  apiMock.expectGetTestMode(false);
  apiMock.expectGetElectionDefinition(electionGeneralDefinition);

  const hardware = MemoryHardware.buildStandard();
  render(<App apiClient={apiMock.apiClient} hardware={hardware} />);
  await authenticateAsElectionManager(electionGeneralDefinition);

  userEvent.click(screen.getButton('Settings'));

  screen.getByText('Toggle to Test Ballot Mode');

  await waitFor(() => {
    apiMock.assertComplete();
  });
});

test('shows an "official ballot mode" button if the app is in Test Mode', async () => {
  apiMock.expectGetTestMode(true);
  apiMock.expectGetElectionDefinition(electionGeneralDefinition);

  const hardware = MemoryHardware.buildStandard();
  render(<App apiClient={apiMock.apiClient} hardware={hardware} />);
  await authenticateAsElectionManager(electionGeneralDefinition);

  screen.getByText('Test Ballot Mode');
  userEvent.click(screen.getButton('Settings'));

  screen.getByText('Test Ballot Mode');
  screen.getByText('Toggle to Official Ballot Mode');

  await waitFor(() => {
    apiMock.assertComplete();
  });
});

test('clicking Scan Batch will scan a batch', async () => {
  apiMock.expectGetTestMode(true);
  apiMock.expectGetElectionDefinition(electionGeneralDefinition);

  const scanBatchResponseBody: Scan.ScanBatchResponse = {
    status: 'error',
    errors: [{ type: 'scan-error', message: 'interpreter not ready' }],
  };
  fetchMock.postOnce('/central-scanner/scan/scanBatch', {
    body: scanBatchResponseBody,
  });

  const mockAlert = jest.fn();
  window.alert = mockAlert;
  const hardware = MemoryHardware.buildStandard();

  render(<App apiClient={apiMock.apiClient} hardware={hardware} />);
  await authenticateAsElectionManager(electionGeneralDefinition);

  // error scan
  userEvent.click(screen.getButton('Scan New Batch'));
  await screen.findByText('Scan New Batch'); // wait for button to reset
  expect(mockAlert).toHaveBeenCalled();
  mockAlert.mockClear();

  // successful scan
  fetchMock.postOnce(
    '/central-scanner/scan/scanBatch',
    { body: { status: 'ok', batchId: 'foobar' } },
    { overwriteRoutes: true }
  );
  userEvent.click(screen.getButton('Scan New Batch'));
  await screen.findByText('Scan New Batch'); // wait for button to reset
  expect(mockAlert).not.toHaveBeenCalled();
  mockAlert.mockClear();
});

test('clicking "Save CVRs" shows modal and makes a request to export', async () => {
  apiMock.expectGetTestMode(true);
  apiMock.expectGetElectionDefinition(electionGeneralDefinition);
  const scanStatusResponseBody: Scan.GetScanStatusResponse = {
    canUnconfigure: false,
    batches: [
      {
        id: 'test-batch',
        batchNumber: 1,
        label: 'Batch 1',
        count: 2,
        startedAt: '2021-05-13T13:19:42.353Z',
      },
    ],
    adjudication: { adjudicated: 0, remaining: 0 },
  };
  fetchMock.get(
    '/central-scanner/scan/status',
    { body: scanStatusResponseBody },
    { overwriteRoutes: true }
  );

  const hardware = MemoryHardware.buildStandard();

  render(<App apiClient={apiMock.apiClient} hardware={hardware} />);
  await authenticateAsElectionManager(electionGeneralDefinition);
  apiMock.setUsbDriveStatus(mockUsbDriveStatus('mounted'));

  // wait for the config to load
  const saveButton = screen.getButton('Save CVRs');
  await waitFor(() => expect(saveButton).toBeEnabled());
  userEvent.click(saveButton);
  const modal = await screen.findByRole('alertdialog');
  apiMock.expectExportCastVoteRecords({ isMinimalExport: true });
  userEvent.click(await within(modal).findByText('Save'));
  await within(modal).findByText('CVRs Saved');
  userEvent.click(within(modal).getByText('Cancel'));

  expect(screen.queryByRole('alertdialog')).toEqual(null);
});

test('configuring election from usb election package works end to end', async () => {
  apiMock.expectGetTestMode(true);
  apiMock.expectGetElectionDefinition(null);

  const hardware = MemoryHardware.buildStandard();
  render(<App apiClient={apiMock.apiClient} hardware={hardware} />);
  await authenticateAsElectionManager(
    electionGeneralDefinition,
    'Insert an Election Manager card to configure VxCentralScan',
    'Insert a USB drive containing an election package'
  );
  expect(screen.queryByText('Test Ballot Mode')).not.toBeInTheDocument();

  // Insert USB drive
  expectConfigureFromElectionPackageOnUsbDrive();
  apiMock.setUsbDriveStatus(mockUsbDriveStatus('mounted'));

  await screen.findByText('No ballots have been scanned');

  screen.getByText('General Election');
  screen.getByText(/Franklin County/);
  screen.getByText(/State of Hamilton/);
  screen.getByText(hasTextAcrossElements('Machine ID: 0001'));

  // Remove USB drive
  apiMock.setUsbDriveStatus(mockUsbDriveStatus('no_drive'));

  userEvent.click(screen.getButton('Settings'));
  screen.getByRole('heading', { name: 'Settings' });
  userEvent.click(screen.getButton('Unconfigure Machine'));
  await screen.findByText('Delete all election data?');

  apiMock.expectUnconfigure({ ignoreBackupRequirement: false });
  apiMock.expectGetElectionDefinition(null);
  apiMock.expectGetSystemSettings();
  apiMock.expectGetTestMode(true);
  apiMock.expectEjectUsbDrive();

  userEvent.click(screen.getButton('Yes, Delete Election Data'));
  screen.getByText('Unconfiguring machine');
  await screen.findByText('Insert a USB drive containing an election package');
});

test('authentication works', async () => {
  const hardware = MemoryHardware.buildStandard();
  hardware.setBatchScannerConnected(false);

  apiMock.expectGetTestMode(true);
  apiMock.expectGetElectionDefinition(electionGeneralDefinition);

  render(<App apiClient={apiMock.apiClient} hardware={hardware} />);

  await screen.findByText('VxCentralScan is Locked');

  // Disconnect card reader
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'no_card_reader',
  });
  await screen.findByText('Card Reader Not Detected');
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  await screen.findByText('VxCentralScan is Locked');

  // Insert an election manager card and enter the wrong PIN.
  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: fakeElectionManagerUser(electionGeneralDefinition),
  });
  await screen.findByText('Enter the card PIN');
  apiMock.expectCheckPin('111111');
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: fakeElectionManagerUser(electionGeneralDefinition),
    wrongPinEnteredAt: new Date(),
  });
  await screen.findByText('Incorrect PIN. Please try again.');

  // Remove card and insert an invalid card, e.g. a pollworker card.
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  await screen.findByText('VxCentralScan is Locked');
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'user_role_not_allowed',
  });
  await screen.findByText('Invalid Card');
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });

  // Insert election manager card and enter correct PIN.
  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: fakeElectionManagerUser(electionGeneralDefinition),
  });
  await screen.findByText('Enter the card PIN');
  apiMock.expectCheckPin('123456');
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('2'));
  userEvent.click(screen.getByText('3'));
  userEvent.click(screen.getByText('4'));
  userEvent.click(screen.getByText('5'));
  userEvent.click(screen.getByText('6'));

  // 'Remove Card' screen is shown after successful authentication.
  apiMock.setAuthStatus({
    status: 'remove_card',
    user: fakeElectionManagerUser(electionGeneralDefinition),
    sessionExpiresAt: fakeSessionExpiresAt(),
  });
  await screen.findByText('Remove card to unlock VxCentralScan');

  // Machine is unlocked when card removed
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: fakeElectionManagerUser(electionGeneralDefinition),
    sessionExpiresAt: fakeSessionExpiresAt(),
  });
  await screen.findByRole('heading', { name: 'Scan Ballots' });

  // Lock the machine
  apiMock.expectLogOut();
  userEvent.click(screen.getByText('Lock Machine'));
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  await screen.findByText('VxCentralScan is Locked');
});

test('system administrator can log in and unconfigure machine', async () => {
  apiMock.expectGetTestMode(true);
  apiMock.expectGetElectionDefinition(electionGeneralDefinition);

  const hardware = MemoryHardware.buildStandard();
  render(<App apiClient={apiMock.apiClient} hardware={hardware} />);

  await authenticateAsSystemAdministrator();

  expect(screen.queryByText('Test Ballot Mode')).not.toBeInTheDocument();
  screen.getButton('Reboot to BIOS');
  const unconfigureMachineButton = screen.getButton('Unconfigure Machine');

  userEvent.click(unconfigureMachineButton);
  const modal = await screen.findByRole('alertdialog');

  apiMock.expectUnconfigure({ ignoreBackupRequirement: true });
  apiMock.expectGetElectionDefinition(null);
  apiMock.expectGetSystemSettings();
  apiMock.expectGetTestMode(true);
  userEvent.click(within(modal).getButton('Yes, Delete Election Data'));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
});

test('election manager cannot auth onto machine with different election hash', async () => {
  apiMock.expectGetTestMode(true);
  apiMock.expectGetElectionDefinition(electionGeneralDefinition);

  const hardware = MemoryHardware.buildStandard();
  render(<App apiClient={apiMock.apiClient} hardware={hardware} />);

  await screen.findByText('VxCentralScan is Locked');
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'wrong_election',
    cardUserRole: 'election_manager',
  });
  await screen.findByText(
    'The inserted Election Manager card is programmed for another election and cannot be used to unlock this machine. ' +
      'Use a valid Election Manager or System Administrator card.'
  );
});

test('error boundary', async () => {
  apiMock.expectGetTestMode(true);
  apiMock.expectGetElectionDefinition(electionGeneralDefinition);

  const hardware = MemoryHardware.buildStandard();
  await suppressingConsoleOutput(async () => {
    render(<App apiClient={apiMock.apiClient} hardware={hardware} />);

    await authenticateAsElectionManager(electionGeneralDefinition);

    apiMock.apiClient.logOut.expectCallWith().throws(new Error('Whoa!'));
    userEvent.click(screen.getByText('Lock Machine'));
    await screen.findByText('Something went wrong');
  });
});
