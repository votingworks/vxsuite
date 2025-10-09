import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, waitFor, within } from '../test/react_testing_library';
import {
  ApiMock,
  createApiMock,
  statusNoPaper,
} from '../test/helpers/mock_api_client';
import { App, AppProps } from './app';
import { useSessionSettingsManager } from './utils/use_session_settings_manager';

vi.mock('./utils/use_session_settings_manager');

let apiMock: ApiMock;
const startNewSessionMock = vi.fn();
const pauseSessionMock = vi.fn();
const resumeSessionMock = vi.fn();

function renderApp(props: Partial<AppProps> = {}) {
  render(<App apiClient={apiMock.mockApiClient} noAudio {...props} />);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.removeCard(); // Set a default auth state of no card inserted.
  vi.mocked(useSessionSettingsManager).mockReturnValue({
    startNewSession: startNewSessionMock,
    pauseSession: pauseSessionMock,
    resumeSession: resumeSessionMock,
  });
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('vendor screen', async () => {
  apiMock.expectGetConfig({ electionDefinition: undefined });
  apiMock.expectGetPollsInfo('polls_closed_initial');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatus();
  renderApp();

  apiMock.authenticateAsVendor();
  const rebootButton = await screen.findButton('Reboot to Vendor Menu');
  const unconfigureButton = screen.getButton('Unconfigure Machine');
  screen.getByText('Remove the card to leave this screen.');

  // Unconfigure button should be disabled when no election is configured
  expect(unconfigureButton).toBeDisabled();

  apiMock.expectRebootToVendorMenu();
  userEvent.click(rebootButton);
});

test('vendor screen unconfigure', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_closed_initial');
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatus();
  renderApp();

  apiMock.authenticateAsVendor();
  const unconfigureButton = await screen.findButton('Unconfigure Machine');

  userEvent.click(unconfigureButton);
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Unconfigure Machine' });

  apiMock.mockApiClient.unconfigureElection.expectCallWith().resolves();
  apiMock.expectGetConfig({ electionDefinition: undefined });
  apiMock.expectGetPollsInfo('polls_closed_initial');
  userEvent.click(
    within(modal).getByRole('button', { name: 'Delete All Election Data' })
  );

  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
