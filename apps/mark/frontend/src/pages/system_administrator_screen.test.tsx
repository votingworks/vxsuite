import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { screen } from '../../test/react_testing_library';

import { render } from '../../test/test_utils';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../test/helpers/mock_api_client';
import { SystemAdministratorScreen } from './system_administrator_screen';

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: new Date('2020-10-31T00:00:00.000'),
  });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('SystemAdministratorScreen renders expected contents', () => {
  const unconfigureMachine = vi.fn();
  render(
    provideApi(
      apiMock,
      <SystemAdministratorScreen
        unconfigureMachine={unconfigureMachine}
        isMachineConfigured
        usbDriveStatus={mockUsbDriveStatus('mounted')}
      />
    )
  );

  // These buttons are further tested in libs/ui
  screen.getByRole('button', { name: 'Unconfigure Machine' });
  screen.getByRole('button', { name: 'Save Logs' });
});

test('Can set date and time', async () => {
  render(
    provideApi(
      apiMock,
      <SystemAdministratorScreen
        unconfigureMachine={vi.fn()}
        isMachineConfigured
        usbDriveStatus={mockUsbDriveStatus('mounted')}
      />
    )
  );
  // We just do a simple happy path test here, since the libs/ui/set_clock unit
  // tests cover full behavior
  userEvent.click(screen.getButton('Set Date and Time'));
  apiMock.mockApiClient.setClock
    .expectCallWith({
      isoDatetime: '2020-10-31T00:00:00.000-08:00',
      ianaZone: 'America/Anchorage',
    })
    .resolves();
  apiMock.expectLogOut();
  userEvent.click(screen.getButton('Save'));
  await vi.waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});
