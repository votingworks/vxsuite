import { test, beforeEach, afterEach, vi, expect } from 'vitest';

import {
  PollbookConnectionStatus,
  PollbookServiceInfo,
} from '@votingworks/pollbook-backend';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { screen, within } from '../test/react_testing_library';
import { ApiMock, createApiMock } from '../test/mock_api_client';
import { DeviceStatusBar } from './nav_screen';
import { renderInAppContext } from '../test/render_in_app_context';

const electionFamousNames =
  electionFamousNames2021Fixtures.readElectionDefinition();

const mockPollbookService: PollbookServiceInfo = {
  electionId: electionFamousNames.election.id,
  electionBallotHash: electionFamousNames.ballotHash,
  pollbookPackageHash: 'test-pollbook-hash',
  electionTitle: 'Test Election',
  machineId: 'TEST',
  lastSeen: new Date('2025-01-01'),
  status: PollbookConnectionStatus.WrongElection,
  numCheckIns: 0,
  codeVersion: 'test',
};

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('renders network status as expected', async () => {
  apiMock.setNetworkOffline();
  renderInAppContext(<DeviceStatusBar />, {
    apiMock,
  });
  const networkElement = await screen.findByTestId('network-status');

  const icons = within(networkElement).getAllByRole('img', {
    hidden: true,
  });
  expect(icons[0].getAttribute('data-icon')).toEqual('tower-broadcast');
  expect(icons[1].getAttribute('data-icon')).toEqual('triangle-exclamation');

  // Test setting the network online
  apiMock.setNetworkOnline([]);
  vi.advanceTimersByTime(100);
  // We should show that there is 1 machine in the network (the current machine)
  await within(networkElement).findByText('1');
  const icon = within(networkElement).getByRole('img', {
    hidden: true,
  });
  expect(icon.getAttribute('data-icon')).toEqual('tower-broadcast');
  // Test with other pollbooks on the network
  apiMock.setNetworkOnline([
    {
      ...mockPollbookService,
      status: PollbookConnectionStatus.Connected,
      machineId: '0001',
    },
    {
      ...mockPollbookService,
      status: PollbookConnectionStatus.LostConnection,
      machineId: '0002',
    },
    {
      ...mockPollbookService,
      status: PollbookConnectionStatus.Connected,
      machineId: '0003',
    },
    {
      ...mockPollbookService,
      status: PollbookConnectionStatus.WrongElection,
      machineId: '0004',
    },
    {
      ...mockPollbookService,
      status: PollbookConnectionStatus.ShutDown,
      machineId: '0005',
    },
  ]);
  vi.advanceTimersByTime(100);
  // We should show that there are 3 connected machines on the network (the current machine plus two connected)
  await within(networkElement).findByText('3');
});
