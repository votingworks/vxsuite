import { afterEach, beforeEach, expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ok } from '@votingworks/basics';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { screen, waitFor } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { SystemAdministratorSettingsScreen } from './system_administrator_settings_screen';
import { createApiMock, ApiMock } from '../../test/api';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('System Admin screen', async () => {
  renderInAppContext(<SystemAdministratorSettingsScreen />, {
    apiMock,
  });
  screen.getByRole('heading', { name: 'Settings' });

  screen.getByRole('heading', { name: 'Election' });
  userEvent.click(screen.getButton('Unconfigure Machine'));
  await screen.findByRole('heading', { name: 'Unconfigure Machine' });
  userEvent.click(screen.getButton('Cancel'));

  screen.getByRole('heading', { name: 'Logs' });
  screen.getButton('Save Logs');

  screen.getByRole('heading', { name: 'Date and Time' });
  userEvent.click(screen.getButton('Set Date and Time'));
  await screen.findByRole('heading', { name: 'Set Date and Time' });
});

test('Exporting logs', async () => {
  renderInAppContext(<SystemAdministratorSettingsScreen />, {
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  apiMock.apiClient.exportLogsToUsb
    .expectCallWith({ format: 'vxf' })
    .resolves(ok());

  // Log saving is tested fully in src/components/export_logs_modal.test.tsx
  userEvent.click(screen.getButton('Save Logs'));
  await screen.findByText('Select a log format:');
  userEvent.click(screen.getButton('Save'));
  userEvent.click(await screen.findButton('Close'));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});
