import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { screen, waitFor, within } from '../test/react_testing_library';
import { buildApp } from '../test/helpers/build_app';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: new Date('2020-11-03T22:22:00'),
  });

  Object.defineProperty(window, 'location', {
    writable: true,
    value: { assign: vi.fn() },
  });
  window.location.href = '/';

  apiMock = createApiMock();
  // Set default auth status to logged out.
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  apiMock.setPrinterStatus();
  apiMock.expectGetUsbDriveStatus('no_drive');
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('vendor screen', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata();
  renderApp();

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
  await screen.findByText('VxAdmin Locked');

  // Test "Reboot to Vendor Menu" button
  await apiMock.authenticateAsVendor();
  const rebootButton = await screen.findButton('Reboot to Vendor Menu');
  apiMock.expectRebootToVendorMenu();
  userEvent.click(rebootButton);
});

test('vendor screen unconfigure', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({
    electionDefinition: electionTwoPartyPrimaryDefinition,
  });
  renderApp();

  await apiMock.authenticateAsVendor();
  const unconfigureButton = await screen.findButton('Unconfigure Machine');

  userEvent.click(unconfigureButton);
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Unconfigure Machine' });

  apiMock.expectUnconfigure();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetCurrentElectionMetadata();
  userEvent.click(
    within(modal).getByRole('button', { name: 'Delete All Election Data' })
  );

  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});
