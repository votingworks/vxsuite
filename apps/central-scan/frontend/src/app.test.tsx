import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import fetchMock from 'fetch-mock';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
  hasTextAcrossElements,
  suppressingConsoleOutput,
  mockVendorUser,
} from '@votingworks/test-utils';
import {
  DEFAULT_SYSTEM_SETTINGS,
  constructElectionKey,
  ElectionDefinition,
  formatElectionHashes,
} from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { render, within, screen } from '../test/react_testing_library';
import { App } from './app';
import { ApiMock, createApiMock } from '../test/api';
import { mockBatch, mockStatus } from '../test/fixtures';

const electionDefinition = readElectionGeneralDefinition();
const electionKey = constructElectionKey(electionDefinition.election);

let apiMock: ApiMock;

beforeEach(() => {
  vi.restoreAllMocks();

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
  apiMock.setStatus();

  fetchMock.config.fallbackToNetwork = true;

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
  apiMock.expectConfigure(electionDefinition);
  apiMock.expectGetSystemSettings(DEFAULT_SYSTEM_SETTINGS);
  apiMock.expectGetElectionRecord(electionDefinition);
}

export async function authenticateAsVendor(
  lockScreenText = 'VxCentralScan is Locked'
): Promise<void> {
  // First verify that we're logged out
  await screen.findByText(lockScreenText);

  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockVendorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  await screen.findByText('Lock Machine');
}

export async function authenticateAsSystemAdministrator(
  lockScreenText = 'VxCentralScan is Locked'
): Promise<void> {
  // First verify that we're logged out
  await screen.findByText(lockScreenText);

  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  });
  await screen.findByText('Lock Machine');
}

export async function authenticateAsElectionManager(
  // eslint-disable-next-line @typescript-eslint/no-shadow
  electionDefinition: ElectionDefinition,
  lockScreenText = 'VxCentralScan is Locked',
  postAuthText = 'Lock Machine'
): Promise<void> {
  // First verify that we're logged out
  await screen.findByText(lockScreenText);

  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(electionDefinition.election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  await screen.findByText(postAuthText);
}

test('renders without crashing', async () => {
  apiMock.expectGetTestMode(true);
  apiMock.expectGetElectionRecord(electionDefinition);

  render(<App apiClient={apiMock.apiClient} />);
  await vi.waitFor(() => fetchMock.called());
});

test('clicking Scan Batch will scan a batch', async () => {
  apiMock.expectGetTestMode(true);
  apiMock.expectGetElectionRecord(electionDefinition);

  render(<App apiClient={apiMock.apiClient} />);
  await authenticateAsElectionManager(electionDefinition);

  apiMock.expectScanBatch();
  userEvent.click(screen.getButton('Scan New Batch'));
  await screen.findByText('Scan New Batch'); // wait for button to reset
});

test('clicking "Save CVRs" shows modal and makes a request to export', async () => {
  apiMock.expectGetTestMode(true);
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.setStatus(
    mockStatus({
      batches: [mockBatch()],
    })
  );

  render(<App apiClient={apiMock.apiClient} />);
  await authenticateAsElectionManager(electionDefinition);
  apiMock.setUsbDriveStatus(mockUsbDriveStatus('mounted'));

  // wait for the config to load
  const saveButton = screen.getButton('Save CVRs');
  await vi.waitFor(() => expect(saveButton).toBeEnabled());
  userEvent.click(saveButton);
  await screen.findByRole('alertdialog');
  apiMock.expectExportCastVoteRecords({ isMinimalExport: true });
  userEvent.click(await screen.findByText('Save'));
  await screen.findByText('CVRs Saved');
  userEvent.click(screen.getByText('Close'));

  expect(screen.queryByRole('alertdialog')).toEqual(null);
});

test('configuring election from usb election package works end to end', async () => {
  apiMock.expectGetTestMode(true);
  apiMock.expectGetElectionRecord(null);

  render(<App apiClient={apiMock.apiClient} />);
  await authenticateAsElectionManager(
    electionDefinition,
    'Insert an election manager card to configure VxCentralScan',
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
  screen.getByText(
    hasTextAcrossElements(
      `Election ID: ${formatElectionHashes(
        electionDefinition.ballotHash,
        'test-election-package-hash'
      )}`
    )
  );

  // Remove USB drive
  apiMock.setUsbDriveStatus(mockUsbDriveStatus('no_drive'));

  userEvent.click(screen.getButton('Settings'));
  screen.getByRole('heading', { name: 'Settings' });
  userEvent.click(screen.getButton('Unconfigure Machine'));
  await screen.findByRole('heading', { name: 'Unconfigure Machine' });

  apiMock.expectUnconfigure({ ignoreBackupRequirement: false });
  apiMock.expectGetElectionRecord(null);
  apiMock.expectGetSystemSettings();
  apiMock.expectGetTestMode(true);
  apiMock.expectEjectUsbDrive();

  userEvent.click(screen.getButton('Delete All Election Data'));
  screen.getByText('Unconfiguring Machine');
  await screen.findByText('Insert a USB drive containing an election package');
});

test('authentication works', async () => {
  apiMock.expectGetTestMode(true);
  apiMock.expectGetElectionRecord(electionDefinition);

  render(<App apiClient={apiMock.apiClient} />);

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
    user: mockElectionManagerUser({ electionKey }),
  });
  await screen.findByText('Enter Card PIN');
  apiMock.expectCheckPin('111111');
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: mockElectionManagerUser({ electionKey }),
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
    user: mockElectionManagerUser({ electionKey }),
  });
  await screen.findByText('Enter Card PIN');
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
    user: mockElectionManagerUser({ electionKey }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  await screen.findByText('Remove card to unlock VxCentralScan');

  // Machine is unlocked when card removed
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockElectionManagerUser({ electionKey }),
    sessionExpiresAt: mockSessionExpiresAt(),
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
  apiMock.expectGetElectionRecord(electionDefinition);

  render(<App apiClient={apiMock.apiClient} />);

  await authenticateAsSystemAdministrator();

  expect(screen.queryByText('Test Ballot Mode')).not.toBeInTheDocument();
  const unconfigureMachineButton = screen.getButton('Unconfigure Machine');

  userEvent.click(unconfigureMachineButton);
  const modal = await screen.findByRole('alertdialog');

  apiMock.expectUnconfigure({ ignoreBackupRequirement: true });
  apiMock.expectGetElectionRecord(null);
  apiMock.expectGetSystemSettings();
  apiMock.expectGetTestMode(true);
  userEvent.click(within(modal).getButton('Delete All Election Data'));
  await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
});

test('election manager cannot auth onto machine with different election', async () => {
  apiMock.expectGetTestMode(true);
  apiMock.expectGetElectionRecord(electionDefinition);

  render(<App apiClient={apiMock.apiClient} />);

  await screen.findByText('VxCentralScan is Locked');
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'wrong_election',
    cardUserRole: 'election_manager',
  });
  await screen.findByText(
    'The inserted election manager card is programmed for another election and cannot be used to unlock this machine. ' +
      'Use a valid election manager or system administrator card.'
  );
});

test('error boundary', async () => {
  apiMock.expectGetTestMode(true);
  apiMock.expectGetElectionRecord(electionDefinition);

  await suppressingConsoleOutput(async () => {
    render(<App apiClient={apiMock.apiClient} />);

    await authenticateAsElectionManager(electionDefinition);

    apiMock.apiClient.logOut.expectCallWith().throws(new Error('Whoa!'));
    userEvent.click(screen.getByText('Lock Machine'));
    await screen.findByText('Something went wrong');
  });
});

test('battery display and alert', async () => {
  apiMock.expectGetTestMode(true);
  apiMock.expectGetElectionRecord(electionDefinition);

  render(<App apiClient={apiMock.apiClient} />);
  await authenticateAsSystemAdministrator();

  // initial battery level in nav bar
  await screen.findByText('100%');

  apiMock.setBatteryInfo({ level: 0.1, discharging: true });
  const warning = await screen.findByRole('alertdialog');
  within(warning).getByText('Low Battery Warning');
  userEvent.click(within(warning).getByText('Dismiss'));

  // updated battery level in nav bar
  await screen.findByText('10%');
});

test('vendor screen', async () => {
  apiMock.expectGetTestMode(true);
  apiMock.expectGetElectionRecord(electionDefinition);
  render(<App apiClient={apiMock.apiClient} />);

  await authenticateAsVendor();
  await screen.findButton('Reboot to Vendor Menu');
  const lockMachineButton = screen.getButton('Lock Machine');

  // Test "Lock Machine" button
  apiMock.expectLogOut();
  userEvent.click(lockMachineButton);
  apiMock.setAuthStatus({ status: 'logged_out', reason: 'machine_locked' });
  await screen.findByText('VxCentralScan is Locked');

  // Test "Reboot to Vendor Menu" button
  await authenticateAsVendor();
  const rebootButton = await screen.findButton('Reboot to Vendor Menu');
  apiMock.expectRebootToVendorMenu();
  userEvent.click(rebootButton);
});
