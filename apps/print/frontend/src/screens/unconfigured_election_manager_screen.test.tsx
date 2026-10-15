import { afterEach, beforeEach, test, vi } from 'vitest';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { deferred, err, ok, type Result } from '@votingworks/basics';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { HP_4001_PRINTER_CONFIG } from '@votingworks/printing';
import {
  DEFAULT_SYSTEM_SETTINGS,
  type ElectionDefinition,
  type ElectionPackageConfigurationError,
} from '@votingworks/types';
import { mockUsbDriveStatus } from '@votingworks/ui';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { render, screen } from '../../test/react_testing_library.js';
import {
  type ApiMock,
  ApiMockProvider,
  createApiMock,
} from '../../test/mock_api_client.js';
import {
  type ApiClient,
  createQueryClient,
  getDeviceStatuses,
} from '../api.js';
import { UnconfiguredElectionManagerScreen } from './unconfigured_election_manager_screen.js';

type DeviceStatuses = Awaited<ReturnType<ApiClient['getDeviceStatuses']>>;

const electionDefinition = readElectionGeneralDefinition();
const NO_ELECTION_PACKAGE_MESSAGE =
  'No signed election package found on the inserted USB drive. Save a signed election package in VxAdmin.';

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();
  apiMock.getElectionRecord.expectRepeatedCallsWith().resolves(null);
  apiMock.getMachineConfig.expectCallWith().resolves({
    machineId: 'test-machine',
    codeVersion: 'test-version',
  });
  apiMock.getPollingPlaceId.expectCallWith().resolves(null);
  apiMock.getSystemSettings
    .expectRepeatedCallsWith()
    .resolves(DEFAULT_SYSTEM_SETTINGS);
});

afterEach(() => {
  apiMock.assertComplete();
  vi.useRealTimers();
});

function deviceStatuses(
  usbDriveStatus: UsbDriveStatus['status'],
  isPrinterConnected = true
): DeviceStatuses {
  return {
    usbDrive: mockUsbDriveStatus(usbDriveStatus),
    printer: isPrinterConnected
      ? { connected: true, config: HP_4001_PRINTER_CONFIG }
      : { connected: false },
  };
}

function setDeviceStatuses(statuses: DeviceStatuses) {
  apiMock.getDeviceStatuses.expectRepeatedCallsWith().resolves(statuses);
}

function expectConfigure() {
  const { promise, resolve } =
    deferred<Result<ElectionDefinition, ElectionPackageConfigurationError>>();
  apiMock.configureElectionPackageFromUsb.expectCallWith().returns(promise);
  return resolve;
}

function renderScreen(queryClient = createQueryClient()) {
  render(
    <React.StrictMode>
      <ApiMockProvider apiMock={apiMock} queryClient={queryClient}>
        <MemoryRouter>
          <UnconfiguredElectionManagerScreen />
        </MemoryRouter>
      </ApiMockProvider>
    </React.StrictMode>
  );
}

test('configures from a USB drive that was already inserted', async () => {
  const queryClient = createQueryClient();
  queryClient.setQueryData(
    getDeviceStatuses.queryKey(),
    deviceStatuses('mounted')
  );
  setDeviceStatuses(deviceStatuses('mounted'));
  apiMock.configureElectionPackageFromUsb
    .expectCallWith()
    .resolves(err({ type: 'no_election_package' }));
  renderScreen(queryClient);

  await screen.findByText(NO_ELECTION_PACKAGE_MESSAGE);
  await vi.advanceTimersByTimeAsync(1000);
  screen.getByText(NO_ELECTION_PACKAGE_MESSAGE);
});

test('configures when a USB drive is inserted', async () => {
  setDeviceStatuses(deviceStatuses('no_drive'));
  renderScreen();
  await screen.findByText('Insert a USB drive containing an election package');

  const resolveConfigure = expectConfigure();
  setDeviceStatuses(deviceStatuses('mounted'));
  await screen.findByText('Configuring VxPrint from USB drive…');

  resolveConfigure(ok(electionDefinition));
  await vi.waitFor(() =>
    apiMock.configureElectionPackageFromUsb.assertComplete()
  );
});

test('reconfigures when a USB drive is reinserted', async () => {
  setDeviceStatuses(deviceStatuses('mounted'));
  apiMock.configureElectionPackageFromUsb
    .expectCallWith()
    .resolves(err({ type: 'no_election_package' }));
  renderScreen();
  await screen.findByText(NO_ELECTION_PACKAGE_MESSAGE);

  setDeviceStatuses(deviceStatuses('no_drive'));
  await screen.findByText('Insert a USB drive containing an election package');

  const resolveConfigure = expectConfigure();
  setDeviceStatuses(deviceStatuses('mounted'));
  await screen.findByText('Configuring VxPrint from USB drive…');

  resolveConfigure(err({ type: 'no_election_package' }));
  await screen.findByText(NO_ELECTION_PACKAGE_MESSAGE);
});

test('does not reconfigure when other device statuses change', async () => {
  setDeviceStatuses(deviceStatuses('mounted'));
  apiMock.configureElectionPackageFromUsb
    .expectCallWith()
    .resolves(err({ type: 'no_election_package' }));
  renderScreen();
  await screen.findByText(NO_ELECTION_PACKAGE_MESSAGE);

  setDeviceStatuses(deviceStatuses('mounted', false));
  await vi.advanceTimersByTimeAsync(1000);
  screen.getByText(NO_ELECTION_PACKAGE_MESSAGE);
});
