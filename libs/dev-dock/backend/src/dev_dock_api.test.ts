import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import express from 'express';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as grout from '@votingworks/grout';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
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
  zipFile,
} from '@votingworks/test-utils';
import { DEV_JURISDICTION } from '@votingworks/auth';
import {
  electionFamousNames2021Fixtures,
  readElectionGeneral,
} from '@votingworks/fixtures';
import { Server } from 'node:http';
import { typedAs } from '@votingworks/basics';
import { constructElectionKey, PrinterStatus } from '@votingworks/types';
import {
  getMockConnectedPrinterStatus,
  getMockFilePrinterHandler,
  HP_LASER_PRINTER_CONFIG,
} from '@votingworks/printing';
import {
  PrinterStatus as FujitsuPrinterStatus,
  getMockFileFujitsuPrinterHandler,
} from '@votingworks/fujitsu-thermal-printer';
import { createMockPdiScanner } from '@votingworks/pdi-scanner';
import {
  Api,
  useDevDockRouter,
  MockSpec,
  MockBatchScannerApi,
  DEFAULT_DEV_DOCK_ELECTION_INPUT_PATH,
  DEV_DOCK_ELECTION_FILE_NAME,
} from './dev_dock_api';

const electionGeneral = readElectionGeneral();

const TEST_DEV_DOCK_FILE_DIR = '/tmp/dev-dock-test';

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
  if (fs.existsSync(TEST_DEV_DOCK_FILE_DIR)) {
    fs.rmSync(TEST_DEV_DOCK_FILE_DIR, { recursive: true, force: true });
  }
  const app = express();
  useDevDockRouter(app, express, mockSpec, TEST_DEV_DOCK_FILE_DIR);
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

  getMockFilePrinterHandler().cleanup();
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
  const expectedFixtures = [
    {
      path: 'fixtures/data/electionFamousNames2021/electionGeneratedWithGridLayoutsEnglishOnly.json',
      title: 'electionFamousNames2021',
    },
    {
      path: 'fixtures/data/electionGeneral/election.json',
      title: 'electionGeneral',
    },
    {
      path: 'fixtures/data/electionGridLayoutNewHampshireHudson/election.json',
      title: 'electionGridLayoutNewHampshireHudson',
    },
    {
      path: 'fixtures/data/electionGridLayoutNewHampshireTestBallot/election.json',
      title: 'electionGridLayoutNewHampshireTestBallot',
    },
    {
      path: 'fixtures/data/electionMultiPartyPrimary/election.json',
      title: 'electionMultiPartyPrimary',
    },
    {
      path: 'fixtures/data/electionPrimaryPrecinctSplits/electionGeneratedWithGridLayoutsMultiLang.json',
      title: 'electionPrimaryPrecinctSplits',
    },
    {
      path: 'fixtures/data/electionSimpleSinglePrecinct/election.json',
      title: 'electionSimpleSinglePrecinct',
    },
    {
      path: 'fixtures/data/electionTwoPartyPrimary/election.json',
      title: 'electionTwoPartyPrimary',
    },
  ];

  await expect(
    apiClient.getCurrentFixtureElectionPaths()
  ).resolves.toMatchObject(
    expectedFixtures.map(({ path, title }) => ({
      inputPath: expect.stringContaining(path),
      title,
      resolvedPath: expect.any(String),
    }))
  );
});

test('election setting', async () => {
  const election = electionFamousNames2021Fixtures.readElection();
  const { apiClient } = setup();
  // Default election
  const defaultElection = await apiClient.getElection();
  expect(defaultElection).toMatchObject({
    title: electionGeneral.title,
    inputPath: DEFAULT_DEV_DOCK_ELECTION_INPUT_PATH,
    resolvedPath: expect.any(String),
  });

  await apiClient.setElection({
    inputPath:
      './libs/fixtures/data/electionFamousNames2021/electionGeneratedWithGridLayoutsEnglishOnly.json',
  });
  const updatedElection = await apiClient.getElection();
  expect(updatedElection).toMatchObject({
    title: election.title,
    inputPath:
      './libs/fixtures/data/electionFamousNames2021/electionGeneratedWithGridLayoutsEnglishOnly.json',
    resolvedPath: expect.any(String),
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

test('election loading from zip file', async () => {
  const election = electionFamousNames2021Fixtures.readElection();
  const { apiClient } = setup();

  // Create a zip file containing election.json
  const electionData = JSON.stringify(election);
  const zipBuffer = await zipFile({
    'election.json': electionData,
  });

  // Write the zip file to a temporary location
  const zipPath = join(tmpdir(), 'test-election.zip');
  fs.writeFileSync(zipPath, zipBuffer);

  try {
    // Load election from zip
    await apiClient.setElection({ inputPath: zipPath });

    const loadedElection = await apiClient.getElection();
    const expectedElectionPath = join(
      TEST_DEV_DOCK_FILE_DIR,
      DEV_DOCK_ELECTION_FILE_NAME
    );
    expect(loadedElection).toMatchObject({
      title: election.title,
      inputPath: zipPath,
      resolvedPath: expectedElectionPath,
    });
    expect(loadedElection?.resolvedPath).toBeDefined();
    expect(loadedElection?.resolvedPath).not.toEqual(zipPath);

    // Verify the resolved path is in the stable directory
    expect(loadedElection?.resolvedPath).toEqual(expectedElectionPath);

    // Verify the resolved path is a valid JSON file
    const resolvedElectionData = fs.readFileSync(
      loadedElection!.resolvedPath,
      'utf-8'
    );
    const parsedElection = JSON.parse(resolvedElectionData);
    expect(parsedElection.title).toEqual(election.title);
    expect(parsedElection.county).toEqual(election.county);

    // Verify that insertCard works with zip-loaded elections
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
  } finally {
    // Clean up the zip file
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
  }
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
  const { apiClient: apiClient1 } = setup({ printerConfig: 'fujitsu' });
  expect(await apiClient1.getMockSpec()).toEqual({
    mockPdiScanner: false,
    mockBatchScanner: false,
    printerConfig: 'fujitsu',
    hasAccessibleControllerMock: false,
    hasBarcodeMock: false,
    hasPatInputMock: false,
  });

  const { apiClient: apiClient2 } = setup({
    printerConfig: 'fujitsu',
    getAccessibleControllerConnected: vi.fn(),
    setAccessibleControllerConnected: vi.fn(),
    getBarcodeConnected: vi.fn(),
    setBarcodeConnected: vi.fn(),
    getPatInputConnected: vi.fn(),
    setPatInputConnected: vi.fn(),
  });
  expect(await apiClient2.getMockSpec()).toEqual({
    mockPdiScanner: false,
    mockBatchScanner: false,
    printerConfig: 'fujitsu',
    hasAccessibleControllerMock: true,
    hasBarcodeMock: true,
    hasPatInputMock: true,
  });
});

test('hardware mock status endpoints for barcode, accessible controller, and pat', async () => {
  let barcodeConnected = false;
  let accessibleControllerConnected = false;
  let patInputConnected = false;

  const { apiClient } = setup({
    printerConfig: 'fujitsu',
    getBarcodeConnected: () => barcodeConnected,
    setBarcodeConnected: (connected: boolean) => {
      barcodeConnected = connected;
    },
    getAccessibleControllerConnected: () => accessibleControllerConnected,
    setAccessibleControllerConnected: (connected: boolean) => {
      accessibleControllerConnected = connected;
    },
    getPatInputConnected: () => patInputConnected,
    setPatInputConnected: (connected: boolean) => {
      patInputConnected = connected;
    },
  });

  // Initial state: all disconnected
  await expect(apiClient.getHardwareMockStatus()).resolves.toEqual({
    barcodeConnected: false,
    accessibleControllerConnected: false,
    patInputConnected: false,
  });

  // Toggle barcode
  await apiClient.setBarcodeConnected({ connected: true });
  await expect(apiClient.getHardwareMockStatus()).resolves.toEqual({
    barcodeConnected: true,
    accessibleControllerConnected: false,
    patInputConnected: false,
  });

  // Toggle accessible controller
  await apiClient.setAccessibleControllerConnected({ connected: true });
  await expect(apiClient.getHardwareMockStatus()).resolves.toEqual({
    barcodeConnected: true,
    accessibleControllerConnected: true,
    patInputConnected: false,
  });

  // Toggle PAT input
  await apiClient.setPatInputConnected({ connected: true });
  await expect(apiClient.getHardwareMockStatus()).resolves.toEqual({
    barcodeConnected: true,
    accessibleControllerConnected: true,
    patInputConnected: true,
  });

  // Toggle some back to false
  await apiClient.setBarcodeConnected({ connected: false });
  await apiClient.setPatInputConnected({ connected: false });
  await expect(apiClient.getHardwareMockStatus()).resolves.toEqual({
    barcodeConnected: false,
    accessibleControllerConnected: true,
    patInputConnected: false,
  });
});

test('getHardwareMockStatus returns all false when no getters provided', async () => {
  const { apiClient } = setup({ printerConfig: 'fujitsu' });
  await expect(apiClient.getHardwareMockStatus()).resolves.toEqual({
    barcodeConnected: false,
    accessibleControllerConnected: false,
    patInputConnected: false,
  });
});

test('getHardwareMockStatus handles partial mocks and false values', async () => {
  const { apiClient } = setup({
    printerConfig: 'fujitsu',
    getBarcodeConnected: () => false,
    // Others undefined to exercise fallback path
  });
  await expect(apiClient.getHardwareMockStatus()).resolves.toEqual({
    barcodeConnected: false,
    accessibleControllerConnected: false,
    patInputConnected: false,
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
    path: vxFamousNamesFixtures.markedBallotPath,
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

function createMockBatchScanner(): MockBatchScannerApi {
  let sheets: Array<{ frontPath: string; backPath: string }> = [];
  return {
    addSheets(newSheets) {
      sheets.push(...newSheets);
    },
    getStatus() {
      return { sheetCount: sheets.length };
    },
    clearSheets() {
      sheets = [];
    },
  };
}

test('mock batch scanner - get status', async () => {
  const mockBatchScanner = createMockBatchScanner();
  const { apiClient } = setup({ mockBatchScanner });
  expect(await apiClient.batchScannerGetStatus()).toEqual({ sheetCount: 0 });
});

test('mock batch scanner - load ballots from PDF', async () => {
  const mockBatchScanner = createMockBatchScanner();
  const { apiClient } = setup({ mockBatchScanner });

  await apiClient.batchScannerLoadBallots({
    paths: [vxFamousNamesFixtures.markedBallotPath],
  });

  const status = await apiClient.batchScannerGetStatus();
  expect(status.sheetCount).toBeGreaterThan(0);
});

test('mock batch scanner - clear ballots', async () => {
  const mockBatchScanner = createMockBatchScanner();
  const { apiClient } = setup({ mockBatchScanner });

  await apiClient.batchScannerLoadBallots({
    paths: [vxFamousNamesFixtures.markedBallotPath],
  });
  expect((await apiClient.batchScannerGetStatus()).sheetCount).toBeGreaterThan(
    0
  );

  await apiClient.batchScannerClearBallots();
  expect(await apiClient.batchScannerGetStatus()).toEqual({ sheetCount: 0 });
});

test('mock batch scanner - mock spec reports mockBatchScanner', async () => {
  const mockBatchScanner = createMockBatchScanner();
  const { apiClient } = setup({ mockBatchScanner });
  const spec = await apiClient.getMockSpec();
  expect(spec.mockBatchScanner).toEqual(true);
});
