import userEvent from '@testing-library/user-event';
import { fakeKiosk } from '@votingworks/test-utils';
import { screen } from '../../test/react_testing_library';

import { LogsScreen } from './logs_screen';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/api_mock';

let mockKiosk: jest.Mocked<KioskBrowser.Kiosk>;
let apiMock: ApiMock;

beforeEach(() => {
  mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('Exporting logs', async () => {
  renderInAppContext(<LogsScreen />, { apiMock });

  // Log saving is tested fully in src/components/export_logs_modal.test.tsx
  await userEvent.click(screen.getByText('Save Log File'));
  await screen.findByText('No Log File Present');
  await userEvent.click(screen.getByText('Close'));

  // Log saving is tested fully in src/components/export_logs_modal.test.tsx
  await userEvent.click(screen.getByText('Save CDF Log File'));
  await screen.findByText('No Log File Present');
  await userEvent.click(screen.getByText('Close'));
});

test('Exporting logs when no election definition', async () => {
  renderInAppContext(<LogsScreen />, { electionDefinition: 'NONE', apiMock });

  // Log saving is tested fully in src/components/export_logs_modal.test.tsx
  await userEvent.click(screen.getByText('Save Log File'));
  await screen.findByText('No Log File Present');
  await userEvent.click(screen.getByText('Close'));

  expect(
    screen.getByText('Save CDF Log File').closest('button')
  ).toHaveAttribute('disabled');
});
