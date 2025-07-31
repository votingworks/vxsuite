import { test, beforeEach, afterEach, vi, expect } from 'vitest';

import {
  PollbookConnectionStatus,
  PollbookServiceInfo,
} from '@votingworks/pollbook-backend';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { screen, within } from '../test/react_testing_library';
import { ApiMock, createApiMock } from '../test/mock_api_client';
import { DeviceStatusBar } from './nav_screen';
import { renderInAppContext } from '../test/render_in_app_context';

const electionFamousNames =
  electionFamousNames2021Fixtures.readElectionDefinition();

const mockPollbookService: PollbookServiceInfo = {
  electionId: electionFamousNames.election.id,
  electionBallotHash: electionFamousNames.ballotHash,
  configuredPrecinctId: electionFamousNames.election.precincts[0].id,
  pollbookPackageHash: 'test-package-hash',
  electionTitle: 'Test Election',
  machineId: 'TEST',
  lastSeen: new Date('2025-01-01'),
  status: PollbookConnectionStatus.MismatchedConfiguration,
  numCheckIns: 0,
  codeVersion: 'test',
};

let apiMock: ApiMock;
let unmount: () => void;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
  vi.clearAllMocks();
  if (unmount) {
    unmount();
  }
  vi.useRealTimers();
});

test('renders network status as expected - when unconfigured', async () => {
  apiMock.setNetworkOffline();
  apiMock.expectGetMachineInformation();
  const result = renderInAppContext(<DeviceStatusBar />, {
    apiMock,
  });
  unmount = result.unmount;
  const networkElement = await screen.findByTestId('network-status');

  const icons = within(networkElement).getAllByRole('img', {
    hidden: true,
  });
  expect(icons[0].getAttribute('data-icon')).toEqual('tower-broadcast');
  expect(icons[1].getAttribute('data-icon')).toEqual('triangle-exclamation');

  userEvent.click(icons[0]);
  await screen.findByText('Network Details');
  await screen.findByText('Network is offline.');
  userEvent.click(screen.getByText('Close'));

  // Test setting the network online
  apiMock.setNetworkOnline([]);
  vi.advanceTimersByTime(100);
  // We should show that there is 1 machine in the network (the current machine)
  await within(networkElement).findByText('1');
  const icon = within(networkElement).getByRole('img', {
    hidden: true,
  });
  expect(icon.getAttribute('data-icon')).toEqual('tower-broadcast');
  userEvent.click(icon);
  await screen.findByText('Network Details');
  await screen.findByText('No pollbooks found.');
  userEvent.click(screen.getByText('Close'));
  // Test with other pollbooks on the network
  apiMock.setNetworkOnline([
    {
      ...mockPollbookService,
      status: PollbookConnectionStatus.MismatchedConfiguration,
      electionBallotHash: undefined,
      configuredPrecinctId: undefined,
      machineId: '0001',
    },
    {
      ...mockPollbookService,
      status: PollbookConnectionStatus.LostConnection,
      machineId: '0002',
    },
    {
      ...mockPollbookService,
      status: PollbookConnectionStatus.MismatchedConfiguration,
      machineId: '0003',
    },
    {
      ...mockPollbookService,
      status: PollbookConnectionStatus.ShutDown,
      machineId: '0004',
    },
    {
      ...mockPollbookService,
      status: PollbookConnectionStatus.IncompatibleSoftwareVersion,
      machineId: '0005',
    },
  ]);
  vi.advanceTimersByTime(100);
  // We should show that there are 3 connected machines on the network (the current machine plus two connected)
  await within(networkElement).findByText('3');

  // Open the network modal
  userEvent.click(icon);
  await screen.findByText('Network Details');

  // The table of pollbooks loads
  await screen.findByText('Status');
  await screen.findByText('Machine ID');
  await screen.findByText('Last Seen');

  // Check each row
  const pollbookRows = screen.getAllByTestId('pollbook-row');
  expect(pollbookRows).toHaveLength(5);
  expect(within(pollbookRows[0]).getByText('Connected')).toBeInTheDocument();
  const iconElement0 = within(pollbookRows[0]).getByRole('img', {
    hidden: true,
  });
  expect(iconElement0.getAttribute('data-icon')).toEqual('circle-info');
  expect(within(pollbookRows[0]).getByText('0001')).toBeInTheDocument();

  expect(within(pollbookRows[1]).getByText('Connected')).toBeInTheDocument();
  const iconElement1 = within(pollbookRows[1]).getByRole('img', {
    hidden: true,
  });
  expect(iconElement1.getAttribute('data-icon')).toEqual('circle-info');
  expect(within(pollbookRows[1]).getByText('0003')).toBeInTheDocument();

  expect(
    within(pollbookRows[2]).getByText('Lost Connection')
  ).toBeInTheDocument();
  const iconElement2 = within(pollbookRows[2]).getByRole('img', {
    hidden: true,
  });
  expect(iconElement2.getAttribute('data-icon')).toEqual(
    'triangle-exclamation'
  );
  expect(within(pollbookRows[2]).getByText('0002')).toBeInTheDocument();

  expect(within(pollbookRows[3]).getByText('Powered Off')).toBeInTheDocument();
  const iconElement3 = within(pollbookRows[3]).getByRole('img', {
    hidden: true,
  });
  expect(iconElement3.getAttribute('data-icon')).toEqual('circle-info');
  expect(within(pollbookRows[3]).getByText('0004')).toBeInTheDocument();

  expect(
    within(pollbookRows[4]).getByText('Incompatible Machine')
  ).toBeInTheDocument();
  const iconElement4 = within(pollbookRows[4]).getByRole('img', {
    hidden: true,
  });
  expect(iconElement4.getAttribute('data-icon')).toEqual('circle-exclamation');
  expect(within(pollbookRows[4]).getByText('0005')).toBeInTheDocument();

  userEvent.click(screen.getByText('Close'));
});

test('renders network status as expected - when configured', async () => {
  apiMock.setNetworkOffline();
  apiMock.setElection(
    electionFamousNames,
    electionFamousNames.election.precincts[0].id
  );
  const result = renderInAppContext(<DeviceStatusBar />, {
    apiMock,
  });
  unmount = result.unmount;
  const networkElement = await screen.findByTestId('network-status');

  const icons = within(networkElement).getAllByRole('img', {
    hidden: true,
  });
  expect(icons[0].getAttribute('data-icon')).toEqual('tower-broadcast');
  expect(icons[1].getAttribute('data-icon')).toEqual('triangle-exclamation');

  userEvent.click(icons[0]);
  await screen.findByText('Network Details');
  await screen.findByText('Network is offline.');
  userEvent.click(screen.getByText('Close'));

  // Test setting the network online
  apiMock.setNetworkOnline([]);
  vi.advanceTimersByTime(100);
  // We should show that there is 1 machine in the network (the current machine)
  await within(networkElement).findByText('1');
  const icon = within(networkElement).getByRole('img', {
    hidden: true,
  });
  expect(icon.getAttribute('data-icon')).toEqual('tower-broadcast');
  userEvent.click(icon);
  await screen.findByText('Network Details');
  await screen.findByText('No pollbooks found.');
  userEvent.click(screen.getByText('Close'));
  // Test with other pollbooks on the network
  apiMock.setNetworkOnline([
    {
      ...mockPollbookService,
      status: PollbookConnectionStatus.MismatchedConfiguration,
      electionBallotHash: undefined,
      configuredPrecinctId: undefined,
      machineId: '0001',
    },
    {
      ...mockPollbookService,
      status: PollbookConnectionStatus.LostConnection,
      machineId: '0002',
    },
    {
      ...mockPollbookService,
      status: PollbookConnectionStatus.MismatchedConfiguration,
      configuredPrecinctId: undefined,
      machineId: '0003',
    },
    {
      ...mockPollbookService,
      status: PollbookConnectionStatus.ShutDown,
      machineId: '0004',
    },
    {
      ...mockPollbookService,
      status: PollbookConnectionStatus.IncompatibleSoftwareVersion,
      machineId: '0005',
    },
    {
      ...mockPollbookService,
      status: PollbookConnectionStatus.Connected,
      machineId: '0006',
    },
  ]);
  vi.advanceTimersByTime(100);
  // We should show that there are 2 connected machines on the network (the current machine plus one connected)
  await within(networkElement).findByText('2');

  // Open the network modal
  userEvent.click(icon);
  await screen.findByText('Network Details');

  // The table of pollbooks loads
  await screen.findByText('Status');
  await screen.findByText('Machine ID');
  await screen.findByText('Last Seen');

  // Check each row
  const pollbookRows = screen.getAllByTestId('pollbook-row');
  expect(pollbookRows).toHaveLength(6);
  expect(within(pollbookRows[0]).getByText('Synced')).toBeInTheDocument();
  const iconElement0 = within(pollbookRows[0]).getByRole('img', {
    hidden: true,
  });
  // This is a checkmark icon. There is no data-icon attribute for this icon.
  expect(iconElement0).toMatchInlineSnapshot(`
    <svg
      aria-hidden="true"
      class="sc-enkILE jmEncv"
      height="100"
      role="img"
      style="color: rgb(25, 72, 25);"
      viewBox="0 0 100 100"
      width="100"
    >
      <path
        d="M89.7038 10.1045C88.2094 8.40006 85.759 8.40006 84.2646 10.1045L39.0198 61.5065L15.719 34.8471C14.2245 33.1364 11.7906 33.1364 10.2852 34.8471L2.12082 44.1186C0.626395 45.8105 0.626395 48.5951 2.12082 50.2996L36.2782 89.3708C37.7727 91.0628 40.2066 91.0628 41.7175 89.3708L97.8627 25.5632C99.3791 23.8587 99.3791 21.0679 97.8627 19.3572L89.7038 10.1045Z"
      />
    </svg>
  `);
  expect(within(pollbookRows[0]).getByText('0006')).toBeInTheDocument();

  expect(
    within(pollbookRows[1]).getByText('Different Election')
  ).toBeInTheDocument();
  const iconElement1 = within(pollbookRows[1]).getByRole('img', {
    hidden: true,
  });
  expect(iconElement1.getAttribute('data-icon')).toEqual('circle-info');
  expect(within(pollbookRows[1]).getByText('0001')).toBeInTheDocument();

  expect(
    within(pollbookRows[2]).getByText('Different Precinct')
  ).toBeInTheDocument();
  const iconElement2 = within(pollbookRows[2]).getByRole('img', {
    hidden: true,
  });
  expect(iconElement2.getAttribute('data-icon')).toEqual('circle-info');
  expect(within(pollbookRows[2]).getByText('0003')).toBeInTheDocument();

  expect(
    within(pollbookRows[3]).getByText('Lost Connection')
  ).toBeInTheDocument();
  const iconElement3 = within(pollbookRows[3]).getByRole('img', {
    hidden: true,
  });
  expect(iconElement3.getAttribute('data-icon')).toEqual(
    'triangle-exclamation'
  );
  expect(within(pollbookRows[3]).getByText('0002')).toBeInTheDocument();

  expect(within(pollbookRows[4]).getByText('Powered Off')).toBeInTheDocument();
  const iconElement4 = within(pollbookRows[4]).getByRole('img', {
    hidden: true,
  });
  expect(iconElement4.getAttribute('data-icon')).toEqual('circle-info');
  expect(within(pollbookRows[4]).getByText('0004')).toBeInTheDocument();

  expect(
    within(pollbookRows[5]).getByText('Incompatible Machine')
  ).toBeInTheDocument();
  const iconElement5 = within(pollbookRows[5]).getByRole('img', {
    hidden: true,
  });
  expect(iconElement5.getAttribute('data-icon')).toEqual('circle-exclamation');
  expect(within(pollbookRows[5]).getByText('0005')).toBeInTheDocument();

  userEvent.click(screen.getByText('Close'));
});

test('renders barcode scanner status warning when scanner is disconnected', async () => {
  apiMock.setBarcodeScannerStatus(false);
  apiMock.setElection(
    electionFamousNames,
    electionFamousNames.election.precincts[0].id
  );
  const result = renderInAppContext(<DeviceStatusBar />, {
    apiMock,
  });
  unmount = result.unmount;
  const barcodeScannerElement = await screen.findByTestId(
    'barcode-scanner-status'
  );

  const icons = within(barcodeScannerElement).getAllByRole('img', {
    hidden: true,
  });
  expect(icons.length).toEqual(2);
  expect(icons[0].getAttribute('data-icon')).toEqual('id-card');
  expect(icons[1].getAttribute('data-icon')).toEqual('triangle-exclamation');
});

test('renders barcode scanner status without warning when scanner is connected', async () => {
  apiMock.setBarcodeScannerStatus(true);
  apiMock.setElection(
    electionFamousNames,
    electionFamousNames.election.precincts[0].id
  );
  const result = renderInAppContext(<DeviceStatusBar />, {
    apiMock,
  });
  unmount = result.unmount;
  const barcodeScannerElement = await screen.findByTestId(
    'barcode-scanner-status'
  );

  const icons = within(barcodeScannerElement).getAllByRole('img', {
    hidden: true,
  });
  expect(icons.length).toEqual(1);
  expect(icons[0].getAttribute('data-icon')).toEqual('id-card');
});
