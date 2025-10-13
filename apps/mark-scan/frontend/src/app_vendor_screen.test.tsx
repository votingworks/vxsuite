import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';

import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';
import { render, screen, waitFor, within } from '../test/react_testing_library';
import { App } from './app';

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('vendor screen', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionRecord(null);
  apiMock.expectGetElectionState();
  render(<App apiClient={apiMock.mockApiClient} />);

  apiMock.setAuthStatusVendorLoggedIn();
  const rebootButton = await screen.findButton('Reboot to Vendor Menu');
  const unconfigureButton = screen.getButton('Unconfigure Machine');
  screen.getByText('Remove the card to leave this screen.');

  // Unconfigure button should be disabled when no election is configured
  expect(unconfigureButton).toBeDisabled();

  apiMock.expectRebootToVendorMenu();
  userEvent.click(rebootButton);
});

test('vendor screen unconfigure', async () => {
  const electionDefinition = readElectionGeneralDefinition();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectGetElectionState();
  render(<App apiClient={apiMock.mockApiClient} />);

  apiMock.setAuthStatusVendorLoggedIn();
  const unconfigureButton = await screen.findButton('Unconfigure Machine');

  userEvent.click(unconfigureButton);
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Unconfigure Machine' });

  apiMock.expectUnconfigureMachine();
  apiMock.expectGetElectionRecord(null);
  apiMock.expectGetElectionState();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetMachineConfig();
  userEvent.click(
    within(modal).getByRole('button', { name: 'Delete All Election Data' })
  );

  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});
