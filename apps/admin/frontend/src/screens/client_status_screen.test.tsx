import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { renderInAppContext } from '../../test/render_in_app_context';
import { screen } from '../../test/react_testing_library';
import { ClientStatusScreen } from './client_status_screen';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('shows offline message when not online', async () => {
  apiMock.expectGetNetworkStatus({
    mode: 'client',
    isOnline: false,
    connectionStatus: { status: 'not_connected' },
  });
  renderInAppContext(<ClientStatusScreen />, {
    apiMock,
    machineMode: 'client',
  });

  await screen.findByText(/Network offline/);
});

test('shows searching state when online but not connected', async () => {
  apiMock.expectGetNetworkStatus({
    mode: 'client',
    isOnline: true,
    connectionStatus: { status: 'not_connected' },
  });
  renderInAppContext(<ClientStatusScreen />, {
    apiMock,
    machineMode: 'client',
  });

  await screen.findByText('Searching for Host VxAdmin...');
});

test('shows connected state with host machine ID', async () => {
  apiMock.expectGetNetworkStatus({
    mode: 'client',
    isOnline: true,
    connectionStatus: { status: 'connected', hostMachineId: '1234' },
  });
  renderInAppContext(<ClientStatusScreen />, {
    apiMock,
    machineMode: 'client',
  });

  await screen.findByText('Connected to Host VxAdmin');
  screen.getByText(/Host Machine ID: 1234/);
});

test('shows too many hosts error', async () => {
  apiMock.expectGetNetworkStatus({
    mode: 'client',
    isOnline: true,
    connectionStatus: { status: 'too_many_hosts', hostCount: 3 },
  });
  renderInAppContext(<ClientStatusScreen />, {
    apiMock,
    machineMode: 'client',
  });

  await screen.findByText(/Multiple Host VxAdmin machines detected/);
  expect(screen.getByText(/\(3\)/)).toBeDefined();
});

test('renders machine mode selector', async () => {
  apiMock.expectGetNetworkStatus({
    mode: 'client',
    isOnline: true,
    connectionStatus: { status: 'not_connected' },
  });
  renderInAppContext(<ClientStatusScreen />, {
    apiMock,
    machineMode: 'client',
  });

  await screen.findByRole('heading', { name: 'Machine Mode' });
});
