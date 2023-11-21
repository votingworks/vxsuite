import { fakeKiosk } from '@votingworks/test-utils';
import { ok } from '@votingworks/basics';
import { mockUsbDriveStatus } from '@votingworks/ui';
import userEvent from '@testing-library/user-event';
import { screen } from '../../test/react_testing_library';
import { LogsScreen } from './logs_screen';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

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
  renderInAppContext(<LogsScreen />, {
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  apiMock.apiClient.exportLogsToUsb.expectCallWith().resolves(ok());

  // Log saving is tested fully in src/components/export_logs_modal.test.tsx
  userEvent.click(screen.getByText('Save Log File'));
  await screen.findByText('Save logs on the inserted USB drive?');
  userEvent.click(screen.getByText('Save'));
});
