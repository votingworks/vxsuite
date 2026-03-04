import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { renderInAppContext } from '../../test/render_in_app_context';
import { screen } from '../../test/react_testing_library';
import { ConnectedClientsList } from './connected_clients_list';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('returns null when not in host mode', () => {
  apiMock.expectGetNetworkStatus({ mode: 'traditional' });
  const { container } = renderInAppContext(<ConnectedClientsList />, {
    apiMock,
  });

  // Component renders null for non-host modes
  expect(container.innerHTML).toBe('');
});

test('shows publishing status with no connected clients', async () => {
  apiMock.expectGetNetworkStatus({
    mode: 'host',
    isPublishing: true,
    connectedClients: [],
  });
  renderInAppContext(<ConnectedClientsList />, {
    apiMock,
    machineMode: 'host',
  });

  await screen.findByText('Host Status');
  screen.getByText('Publishing: Yes');
  screen.getByText('No connected clients.');
});

test('shows not publishing status', async () => {
  apiMock.expectGetNetworkStatus({
    mode: 'host',
    isPublishing: false,
    connectedClients: [],
  });
  renderInAppContext(<ConnectedClientsList />, {
    apiMock,
    machineMode: 'host',
  });

  await screen.findByText('Publishing: No');
});

test('shows connected clients table', async () => {
  apiMock.expectGetNetworkStatus({
    mode: 'host',
    isPublishing: true,
    connectedClients: [
      { machineId: 'ABC1', lastSeen: '2024-01-01T00:00:00Z' },
      { machineId: 'DEF2', lastSeen: '2024-01-01T01:00:00Z' },
    ],
  });
  renderInAppContext(<ConnectedClientsList />, {
    apiMock,
    machineMode: 'host',
  });

  await screen.findByText('ABC1');
  screen.getByText('DEF2');
  screen.getByText('2024-01-01T00:00:00Z');
  screen.getByText('2024-01-01T01:00:00Z');
});
