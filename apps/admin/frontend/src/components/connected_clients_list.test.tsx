import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { renderInAppContext } from '../../test/render_in_app_context';
import { screen } from '../../test/react_testing_library';
import { HostStatusPanel } from './connected_clients_list';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('returns null when not in host mode', () => {
  apiMock.expectGetNetworkStatus({
    mode: 'client',
    isOnline: false,
    connectionStatus: { status: 'not_connected' },
  });
  const { container } = renderInAppContext(<HostStatusPanel />, {
    apiMock,
  });

  expect(container.innerHTML).toBe('');
});

test('shows offline message when network is unavailable', async () => {
  apiMock.expectGetNetworkStatus({
    mode: 'host',
    isOnline: false,
    isPublishing: false,
    connectedClients: [],
  });
  renderInAppContext(<HostStatusPanel />, {
    apiMock,
    machineMode: 'host',
  });

  await screen.findByText('Host Status');
  screen.getByText('Network offline.');
});

test('shows publishing status with no connected clients', async () => {
  apiMock.expectGetNetworkStatus({
    mode: 'host',
    isOnline: true,
    isPublishing: true,
    connectedClients: [],
  });
  renderInAppContext(<HostStatusPanel />, {
    apiMock,
    machineMode: 'host',
  });

  await screen.findByText('Host Status');
  screen.getByText('Publishing: Yes');
  screen.getByText('No connected clients.');
});

test('shows other hosts warning', async () => {
  apiMock.expectGetNetworkStatus({
    mode: 'host',
    isOnline: true,
    isPublishing: true,
    connectedClients: [],
    otherHostsDetected: 2,
  });
  renderInAppContext(<HostStatusPanel />, {
    apiMock,
    machineMode: 'host',
  });

  await screen.findByText(/2 other host\(s\) detected/);
});
