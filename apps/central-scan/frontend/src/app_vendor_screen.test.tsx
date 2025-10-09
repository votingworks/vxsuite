import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { render, within, screen, waitFor } from '../test/react_testing_library';
import { App } from './app';
import { ApiMock, createApiMock } from '../test/api';

const electionDefinition = readElectionGeneralDefinition();

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
});

afterEach(() => {
  apiMock.assertComplete();
});

test('vendor screen', async () => {
  apiMock.expectGetTestMode(true);
  apiMock.expectGetElectionRecord(null);
  render(<App apiClient={apiMock.apiClient} />);

  await apiMock.authenticateAsVendor();
  await screen.findButton('Reboot to Vendor Menu');
  const lockMachineButton = screen.getButton('Lock Machine');
  const unconfigureButton = screen.getButton('Unconfigure Machine');

  // Unconfigure button should be disabled when no election is configured
  expect(unconfigureButton).toBeDisabled();

  // Test "Lock Machine" button
  apiMock.expectLogOut();
  userEvent.click(lockMachineButton);
  apiMock.setAuthStatus({ status: 'logged_out', reason: 'machine_locked' });
  await screen.findByText('VxCentralScan is Locked');

  // Test "Reboot to Vendor Menu" button
  await apiMock.authenticateAsVendor();
  const rebootButton = await screen.findButton('Reboot to Vendor Menu');
  apiMock.expectRebootToVendorMenu();
  userEvent.click(rebootButton);
});

test('vendor screen unconfigure', async () => {
  apiMock.expectGetTestMode(true);
  apiMock.expectGetElectionRecord(electionDefinition);
  render(<App apiClient={apiMock.apiClient} />);

  await apiMock.authenticateAsVendor();
  const unconfigureButton = await screen.findButton('Unconfigure Machine');

  userEvent.click(unconfigureButton);
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Unconfigure Machine' });

  apiMock.expectUnconfigure({ ignoreBackupRequirement: true });
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(null);
  apiMock.expectGetTestMode(true);
  apiMock.setStatus();
  userEvent.click(
    within(modal).getByRole('button', { name: 'Delete All Election Data' })
  );

  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});
