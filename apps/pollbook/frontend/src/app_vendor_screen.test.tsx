import { test, beforeEach, afterEach, expect, vi } from 'vitest';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { ElectionDefinition } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '../test/react_testing_library';
import { App } from './app';
import { ApiMock, createApiMock } from '../test/mock_api_client';

let apiMock: ApiMock;
let unmount: () => void = () => {
  throw new Error('unmount was not bound after render');
};

const famousNamesElection: ElectionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
  unmount();
});

function renderApp() {
  ({ unmount } = render(<App apiClient={apiMock.mockApiClient} />));
}

test('vendor screen', async () => {
  apiMock.setElection(); // No election configured
  apiMock.expectGetDeviceStatuses();
  apiMock.authenticateAsVendor();
  renderApp();

  await screen.findButton('Reboot to Vendor Menu');
  const lockMachineButton = screen.getButton('Lock Machine');
  const unconfigureButton = screen.getButton('Unconfigure Machine');

  // Unconfigure button should be disabled when no election is configured
  expect(unconfigureButton).toBeDisabled();

  // Test "Lock Machine" button
  apiMock.mockApiClient.logOut.expectCallWith().resolves();
  userEvent.click(lockMachineButton);

  // Test "Reboot to Vendor Menu" button
  apiMock.authenticateAsVendor();
  const rebootButton = await screen.findButton('Reboot to Vendor Menu');
  apiMock.mockApiClient.rebootToVendorMenu.expectCallWith().resolves();
  userEvent.click(rebootButton);
});

test('vendor screen unconfigure', async () => {
  apiMock.setElection(famousNamesElection);
  apiMock.expectGetDeviceStatuses();
  apiMock.authenticateAsVendor();
  renderApp();

  const unconfigureButton = await screen.findButton('Unconfigure Machine');

  userEvent.click(unconfigureButton);
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Unconfigure Machine' });

  apiMock.expectUnconfigureElection();
  apiMock.setElection();

  userEvent.click(
    within(modal).getByRole('button', { name: 'Delete All Election Data' })
  );
  await screen.findByText('Unconfiguring Machine');
});
