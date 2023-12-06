import userEvent from '@testing-library/user-event';
import { MockApiClient, createMockApiClient } from '../../test/api';
import { screen } from '../../test/react_testing_library';
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

  screen.getByRole('heading', { name: 'Machine' });
  screen.getButton('Power Down');

  screen.getByRole('heading', { name: 'Software Update' });
  screen.getButton('Reboot to BIOS');

  screen.getByRole('heading', { name: 'Date and Time' });
  userEvent.click(screen.getButton('Set Date and Time'));
  await screen.findByRole('heading', { name: 'Set Date and Time' });
});
