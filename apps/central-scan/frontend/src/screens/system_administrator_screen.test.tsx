import userEvent from '@testing-library/user-event';
import { ok } from '@votingworks/basics';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { MockApiClient, createMockApiClient } from '../../test/api';
import { screen, waitFor } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { SystemAdministratorScreen } from './system_administrator_screen';

let mockApiClient: MockApiClient;

beforeEach(() => {
  mockApiClient = createMockApiClient();
});

afterEach(() => {
  mockApiClient.assertComplete();
});

test('System Admin screen', async () => {
  renderInAppContext(<SystemAdministratorScreen />, {
    apiClient: mockApiClient,
  });
  screen.getByRole('heading', { name: 'System Administrator' });

  screen.getByRole('heading', { name: 'Election' });
  userEvent.click(screen.getButton('Unconfigure Machine'));
  await screen.findByText('Delete all election data?');
  userEvent.click(screen.getButton('Cancel'));

  screen.getByRole('heading', { name: 'Software Update' });
  screen.getButton('Reboot to BIOS');
  screen.getButton('Power Down');

  screen.getByRole('heading', { name: 'Logs' });
  screen.getButton('Save Log File');

  screen.getByRole('heading', { name: 'Date and Time' });
  userEvent.click(screen.getButton('Set Date and Time'));
  await screen.findByRole('heading', { name: 'Set Date and Time' });
});

test('Exporting logs', async () => {
  renderInAppContext(<SystemAdministratorScreen />, {
    apiClient: mockApiClient,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  mockApiClient.exportLogsToUsb.expectCallWith().resolves(ok());

  // Log saving is tested fully in src/components/export_logs_modal.test.tsx
  userEvent.click(screen.getButton('Save Log File'));
  await screen.findByText('Save logs on the inserted USB drive?');
  userEvent.click(screen.getButton('Save'));
  userEvent.click(await screen.findButton('Close'));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});
