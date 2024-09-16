import express from 'express';
import * as fs from 'node:fs';
import * as grout from '@votingworks/grout';
import { AddressInfo } from 'node:net';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { DEV_JURISDICTION } from '@votingworks/auth';
import {
  electionFamousNames2021Fixtures,
  electionGeneral,
} from '@votingworks/fixtures';
import { Server } from 'node:http';
import { typedAs } from '@votingworks/basics';
import { constructElectionKey, PrinterStatus } from '@votingworks/types';
import {
  getMockConnectedPrinterStatus,
  getMockFilePrinterHandler,
} from '@votingworks/printing';
import {
  Api,
  MachineType,
  DEFAULT_PRINTERS,
  useDevDockRouter,
} from './dev_dock_api';

const TEST_DEV_DOCK_FILE_PATH = '/tmp/dev-dock.test.json';

const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', () => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});

let server: Server;

function setup(machineType: MachineType = 'scan') {
  if (fs.existsSync(TEST_DEV_DOCK_FILE_PATH)) {
    fs.unlinkSync(TEST_DEV_DOCK_FILE_PATH);
  }
  const app = express();
  useDevDockRouter(app, express, machineType, TEST_DEV_DOCK_FILE_PATH);
  server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/dock`;
  const apiClient = grout.createClient<Api>({ baseUrl });
  return { apiClient };
}

beforeEach(() => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_DEV_DOCK
  );
});

afterEach(() => {
  server.close();
});

test('does not mount dev dock endpoints when feature flag is disabled', async () => {
  featureFlagMock.disableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_DEV_DOCK
  );
  const { apiClient } = setup();
  await expect(apiClient.getElection()).rejects.toThrow();
  await expect(apiClient.getUsbDriveStatus()).rejects.toThrow();
  await expect(apiClient.getCardStatus()).rejects.toThrow();
});

// Note: This test overwrites the global mock card state.
test('card mock endpoints', async () => {
  const { apiClient } = setup();
  await apiClient.removeCard(); // Reset card state to no_card to start in case it's not already

  await expect(apiClient.getCardStatus()).resolves.toEqual({
    status: 'no_card',
  });

  await apiClient.insertCard({ role: 'system_administrator' });
  await expect(apiClient.getCardStatus()).resolves.toEqual({
    status: 'ready',
    cardDetails: {
      user: mockSystemAdministratorUser({ jurisdiction: DEV_JURISDICTION }),
    },
  });

  await apiClient.removeCard();
  await expect(apiClient.getCardStatus()).resolves.toEqual({
    status: 'no_card',
  });

  await apiClient.insertCard({ role: 'election_manager' });
  await expect(apiClient.getCardStatus()).resolves.toEqual({
    status: 'ready',
    cardDetails: {
      user: mockElectionManagerUser({
        electionKey: constructElectionKey(electionGeneral),
        jurisdiction: DEV_JURISDICTION,
      }),
    },
  });

  await apiClient.removeCard();

  await apiClient.insertCard({ role: 'poll_worker' });
  await expect(apiClient.getCardStatus()).resolves.toEqual({
    status: 'ready',
    cardDetails: {
      user: mockPollWorkerUser({
        electionKey: constructElectionKey(electionGeneral),
        jurisdiction: DEV_JURISDICTION,
      }),
      hasPin: false,
    },
  });
});

test('election setting', async () => {
  const { apiClient } = setup();
  // Default election
  await expect(apiClient.getElection()).resolves.toEqual({
    title: electionGeneral.title,
    path: 'libs/fixtures/data/electionGeneral/election.json',
  });

  await apiClient.setElection({
    path: 'libs/fixtures/data/electionFamousNames2021/election.json',
  });
  await expect(apiClient.getElection()).resolves.toEqual({
    title: electionFamousNames2021Fixtures.election.title,
    path: 'libs/fixtures/data/electionFamousNames2021/election.json',
  });

  // Changing the election should change the election for mocked cards
  await apiClient.removeCard();
  await apiClient.insertCard({ role: 'election_manager' });
  await expect(apiClient.getCardStatus()).resolves.toEqual({
    status: 'ready',
    cardDetails: {
      user: mockElectionManagerUser({
        electionKey: constructElectionKey(
          electionFamousNames2021Fixtures.election
        ),
        jurisdiction: DEV_JURISDICTION,
      }),
    },
  });
});

test('usb drive mock endpoints', async () => {
  const { apiClient } = setup();
  await apiClient.removeUsbDrive(); // Reset USB state to removed to start in case it's not already

  await expect(apiClient.getUsbDriveStatus()).resolves.toEqual('removed');

  await apiClient.insertUsbDrive();
  await expect(apiClient.getUsbDriveStatus()).resolves.toEqual('inserted');

  await apiClient.clearUsbDrive();
  await expect(apiClient.getUsbDriveStatus()).resolves.toEqual('inserted');

  await apiClient.removeUsbDrive();
  await expect(apiClient.getUsbDriveStatus()).resolves.toEqual('removed');

  await apiClient.clearUsbDrive();
  await expect(apiClient.getUsbDriveStatus()).resolves.toEqual('removed');
});

test('machine type', async () => {
  const { apiClient: apiClientMark } = setup('mark');
  expect(await apiClientMark.getMachineType()).toEqual('mark');

  server.close();

  const { apiClient: apiClientScan } = setup('scan');
  expect(await apiClientScan.getMachineType()).toEqual('scan');
});

test.each(typedAs<MachineType[]>(['admin', 'scan']))(
  'printer for machine type %s',
  async (machineType) => {
    getMockFilePrinterHandler().cleanup();

    const { apiClient } = setup(machineType);
    await expect(apiClient.getPrinterStatus()).resolves.toEqual(
      typedAs<PrinterStatus>({
        connected: false,
      })
    );

    await apiClient.connectPrinter();
    await expect(apiClient.getPrinterStatus()).resolves.toEqual(
      typedAs<PrinterStatus>(
        getMockConnectedPrinterStatus(DEFAULT_PRINTERS[machineType]!)
      )
    );

    await apiClient.disconnectPrinter();
    await expect(apiClient.getPrinterStatus()).resolves.toEqual(
      typedAs<PrinterStatus>({
        connected: false,
      })
    );
  }
);
