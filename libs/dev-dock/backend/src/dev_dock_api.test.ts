import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import express from 'express';
import * as fs from 'node:fs';
import * as grout from '@votingworks/grout';
import { AddressInfo } from 'node:net';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  backendWaitFor,
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { DEV_JURISDICTION } from '@votingworks/auth';
import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireTestBallotFixtures,
  readElectionGeneral,
} from '@votingworks/fixtures';
import { Server } from 'node:http';
import { typedAs } from '@votingworks/basics';
import { constructElectionKey, PrinterStatus } from '@votingworks/types';
import {
  BROTHER_THERMAL_PRINTER_CONFIG,
  getMockConnectedPrinterStatus,
  HP_LASER_PRINTER_CONFIG,
} from '@votingworks/printing';
import {
  PrinterStatus as FujitsuPrinterStatus,
  getMockFileFujitsuPrinterHandler,
} from '@votingworks/fujitsu-thermal-printer';
import { createMockPdiScanner } from '@votingworks/pdi-scanner';
import { Api, useDevDockRouter, MockSpec } from './dev_dock_api';

const electionGeneral = readElectionGeneral();

const TEST_DEV_DOCK_FILE_PATH = '/tmp/dev-dock.test.json';

const featureFlagMock = getFeatureFlagMock();
vi.mock(
  '@votingworks/utils',
  async (importActual): Promise<typeof import('@votingworks/utils')> => ({
    ...(await importActual<typeof import('@votingworks/utils')>()),
    isFeatureFlagEnabled: (flag) => featureFlagMock.isEnabled(flag),
  })
);

let server: Server;

function setup(mockSpec: MockSpec = {}) {
  if (fs.existsSync(TEST_DEV_DOCK_FILE_PATH)) {
    fs.unlinkSync(TEST_DEV_DOCK_FILE_PATH);
  }
  const app = express();
  useDevDockRouter(app, express, mockSpec, TEST_DEV_DOCK_FILE_PATH);
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

test('election fixture references', async () => {
  const { apiClient } = setup();
  await expect(
    apiClient.getCurrentFixtureElectionPaths()
  ).resolves.toMatchObject([
    {
      path: expect.stringContaining(
        'fixtures/data/electionFamousNames2021/electionGeneratedWithGridLayoutsEnglishOnly.json'
      ),
      title: 'electionFamousNames2021',
    },
    {
      path: expect.stringContaining(
        'fixtures/data/electionGeneral/election.json'
      ),
      title: 'electionGeneral',
    },
    {
      path: expect.stringContaining(
        'fixtures/data/electionGridLayoutNewHampshireHudson/election.json'
      ),
      title: 'electionGridLayoutNewHampshireHudson',
    },
    {
      path: expect.stringContaining(
        'fixtures/data/electionGridLayoutNewHampshireTestBallot/election.json'
      ),
      title: 'electionGridLayoutNewHampshireTestBallot',
    },
    {
      path: expect.stringContaining(
        'fixtures/data/electionPrimaryPrecinctSplits/electionGeneratedWithGridLayoutsMultiLang.json'
      ),
      title: 'electionPrimaryPrecinctSplits',
    },
    {
      path: expect.stringContaining(
        'fixtures/data/electionTwoPartyPrimary/election.json'
      ),
      title: 'electionTwoPartyPrimary',
    },
  ]);
});

test('election setting', async () => {
  const election = electionFamousNames2021Fixtures.readElection();
  const { apiClient } = setup();
  // Default election
  await expect(apiClient.getElection()).resolves.toEqual({
    title: electionGeneral.title,
    path: 'libs/fixtures/data/electionGeneral/election.json',
  });

  await apiClient.setElection({
    path: 'libs/fixtures/data/electionFamousNames2021/electionGeneratedWithGridLayoutsEnglishOnly.json',
  });
  await expect(apiClient.getElection()).resolves.toEqual({
    title: election.title,
    path: 'libs/fixtures/data/electionFamousNames2021/electionGeneratedWithGridLayoutsEnglishOnly.json',
  });

  // Changing the election should change the election for mocked cards
  await apiClient.removeCard();
  await apiClient.insertCard({ role: 'election_manager' });
  await expect(apiClient.getCardStatus()).resolves.toEqual({
    status: 'ready',
    cardDetails: {
      user: mockElectionManagerUser({
        electionKey: constructElectionKey(election),
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

test('mock spec', async () => {
  const { apiClient: apiClientMark } = setup({ printerConfig: 'fujitsu' });
  expect(await apiClientMark.getMockSpec()).toEqual({
    mockPdiScanner: false,
    printerConfig: 'fujitsu',
  });
});

test('HP printer config', async () => {
  const { apiClient } = setup({ printerConfig: HP_LASER_PRINTER_CONFIG });
  await expect(apiClient.getPrinterStatus()).resolves.toEqual(
    typedAs<PrinterStatus>({
      connected: false,
    })
  );

  await apiClient.connectPrinter();
  await expect(apiClient.getPrinterStatus()).resolves.toEqual(
    typedAs<PrinterStatus>(
      getMockConnectedPrinterStatus(HP_LASER_PRINTER_CONFIG)
    )
  );

  await apiClient.disconnectPrinter();
  await expect(apiClient.getPrinterStatus()).resolves.toEqual(
    typedAs<PrinterStatus>({
      connected: false,
    })
  );
});

test('Brother printer config', async () => {
  const { apiClient } = setup({
    printerConfig: BROTHER_THERMAL_PRINTER_CONFIG,
  });
  await expect(apiClient.getPrinterStatus()).resolves.toEqual(
    typedAs<PrinterStatus>({
      connected: false,
    })
  );

  await apiClient.connectPrinter();
  await expect(apiClient.getPrinterStatus()).resolves.toEqual(
    typedAs<PrinterStatus>(
      getMockConnectedPrinterStatus(BROTHER_THERMAL_PRINTER_CONFIG)
    )
  );

  await apiClient.disconnectPrinter();
  await expect(apiClient.getPrinterStatus()).resolves.toEqual(
    typedAs<PrinterStatus>({
      connected: false,
    })
  );
});

test('Fujitsu printer status', async () => {
  const fujitsuPrinterHandler = getMockFileFujitsuPrinterHandler();
  fujitsuPrinterHandler.cleanup();
  const { apiClient } = setup({ printerConfig: 'fujitsu' });
  await expect(apiClient.getFujitsuPrinterStatus()).resolves.toEqual(
    typedAs<FujitsuPrinterStatus>({ state: 'idle' })
  );

  await apiClient.setFujitsuPrinterStatus({ state: 'cover-open' });

  await expect(apiClient.getFujitsuPrinterStatus()).resolves.toEqual(
    typedAs<FujitsuPrinterStatus>({ state: 'cover-open' })
  );
});

test('mock PDI scanner', async () => {
  const mockPdiScanner = createMockPdiScanner();
  const { apiClient } = setup({ mockPdiScanner });

  (await mockPdiScanner.client.connect()).unsafeUnwrap();
  (
    await mockPdiScanner.client.enableScanning({
      doubleFeedDetectionEnabled: false,
      paperLengthInches: 11,
    })
  ).unsafeUnwrap();

  expect(await apiClient.pdiScannerGetSheetStatus()).toEqual('noSheet');

  const scanCompletePromise = new Promise<void>((resolve) => {
    const listener = mockPdiScanner.client.addListener((event) => {
      if (event.event === 'scanComplete') {
        mockPdiScanner.client.removeListener(listener);
        resolve();
      }
    });
  });
  await apiClient.pdiScannerInsertSheet({
    path: electionGridLayoutNewHampshireTestBallotFixtures.templatePdf.asFilePath(),
  });
  expect(await apiClient.pdiScannerGetSheetStatus()).toEqual('sheetInserted');
  await scanCompletePromise;

  (await mockPdiScanner.client.ejectDocument('toFrontAndHold')).unsafeUnwrap();
  await backendWaitFor(
    async () =>
      expect(await apiClient.pdiScannerGetSheetStatus()).toEqual(
        'sheetHeldInFront'
      ),
    { interval: 500 }
  );
  await apiClient.pdiScannerRemoveSheet();
  expect(await apiClient.pdiScannerGetSheetStatus()).toEqual('noSheet');
});
