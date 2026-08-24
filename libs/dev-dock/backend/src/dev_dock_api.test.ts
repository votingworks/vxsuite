import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import express from 'express';
import * as fs from 'node:fs';
import { join } from 'node:path';
import * as grout from '@votingworks/grout';
import {
  vxFamousNamesFixtures,
  vxGeneralElectionFixtures,
} from '@votingworks/hmpb';
import { AddressInfo } from 'node:net';
import {
  BooleanEnvironmentVariableName,
  ELECTION_PACKAGE_FOLDER,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  createElectionPackageZipArchive,
  getMostRecentElectionPackageFilepath,
  mockElectionPackageFileTree,
} from '@votingworks/backend';
import {
  backendWaitFor,
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSystemAdministratorUser,
  zipFile,
} from '@votingworks/test-utils';
import {
  CardStatus,
  DEV_JURISDICTION,
  readFromMockFile,
} from '@votingworks/auth';
import {
  electionFamousNames2021Fixtures,
  makeTemporaryDirectory,
  makeTemporaryFile,
  readElectionGeneral,
} from '@votingworks/fixtures';
import { Server } from 'node:http';
import { Optional, assert, typedAs } from '@votingworks/basics';
import {
  constructElectionKey,
  DEFAULT_SYSTEM_SETTINGS,
  PrinterStatus,
} from '@votingworks/types';
import {
  getMockConnectedPrinterStatus,
  getMockFilePrinterHandler,
  HP_4001_PRINTER_CONFIG,
} from '@votingworks/printing';
import {
  PrinterStatus as FujitsuPrinterStatus,
  getMockFileFujitsuPrinterHandler,
} from '@votingworks/fujitsu-thermal-printer';
import { createMockPdiScanner } from '@votingworks/pdi-scanner';
import {
  getMockUsbDirPath,
  getMockUsbDriveHandler,
  SimulatedUsbPlatform,
  UsbDiskDevPathSchema,
} from '@votingworks/usb-drive';
import {
  Api,
  useDevDockRouter,
  MockSpec,
  MockBatchScannerApi,
  DEV_DOCK_ELECTION_FILE_NAME,
  DevDockSide,
  PdiScannerStatus,
} from './dev_dock_api.js';
import {
  QUICK_CONFIGURE_ELECTION_DIR,
  STAGED_ELECTION_PACKAGE_FILE_NAME,
} from './quick_configure.js';

const electionGeneral = readElectionGeneral();

// Minimal valid single-page PDF for testing odd-page fallback behavior
const SINGLE_PAGE_PDF = [
  '%PDF-1.0',
  '1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj',
  '2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj',
  '3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 100 100]>> endobj',
  'xref',
  '0 4',
  '0000000000 65535 f ',
  '0000000009 00000 n ',
  '0000000058 00000 n ',
  '0000000115 00000 n ',
  'trailer <</Size 4 /Root 1 0 R>>',
  'startxref',
  '190',
  '%%EOF',
].join('\n');

const featureFlagMock = getFeatureFlagMock();
vi.mock(
  '@votingworks/utils',
  async (importActual): Promise<typeof import('@votingworks/utils')> => ({
    ...(await importActual<typeof import('@votingworks/utils')>()),
    isFeatureFlagEnabled: (flag) => featureFlagMock.isEnabled(flag),
  })
);

let server: Server;

function setup(
  mockSpec: MockSpec = {},
  devDockDir: string = makeTemporaryDirectory({ prefix: 'dev-dock-test-' }),
  designExportDir: string = makeTemporaryDirectory({
    prefix: 'design-export-test-',
  })
) {
  const app = express();
  useDevDockRouter(app, express, mockSpec, devDockDir, designExportDir);
  server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/dock`;
  const apiClient = grout.createClient<Api>({ baseUrl });
  return { apiClient, devDockDir, designExportDir };
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

test('dock side endpoints', async () => {
  const { apiClient } = setup();
  await expect(apiClient.getDockSide()).resolves.toEqual('top');

  await apiClient.setDockSide({ side: 'left' });
  await expect(apiClient.getDockSide()).resolves.toEqual('left');

  await expect(
    apiClient.setDockSide({ side: 'diagonal' as DevDockSide })
  ).rejects.toThrow();
  await expect(apiClient.getDockSide()).resolves.toEqual('left');
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
      path: 'fixtures/data/electionCombinedBallotPrimary/election.json',
      title: 'electionCombinedBallotPrimary',
    },
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
      path: 'fixtures/data/electionStraightParty/election.json',
      title: 'electionStraightParty',
    },
    {
      path: 'fixtures/data/electionTwoPartyPrimary/election.json',
      title: 'electionTwoPartyPrimary',
    },
  ];

  await expect(apiClient.getAvailableElections()).resolves.toMatchObject(
    expectedFixtures.map(({ path, title }) => ({
      title: expect.stringContaining(title),
      inputPath: expect.stringContaining(path),
    }))
  );
});

test('detects election packages on mock USB drive', async () => {
  const { apiClient } = setup();
  const usbDrive = getMockUsbDriveHandler();
  const fileTree = await mockElectionPackageFileTree(
    electionFamousNames2021Fixtures.toElectionPackage()
  );
  usbDrive.insert(fileTree);

  const result = await apiClient.getAvailableElections();

  expect(result).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        title: expect.stringMatching(/^USB sdb:/),
        inputPath: expect.stringContaining('.zip'),
      }),
    ])
  );
});

test('skips unmounted USB drives and drives without election packages', async () => {
  const { apiClient } = setup();

  // Insert and then remove a drive — should be skipped (not mounted)
  const usbDrive = getMockUsbDriveHandler();
  usbDrive.insert();
  usbDrive.remove();

  // Insert a second drive with no election packages — should be skipped
  const secondDrive = getMockUsbDriveHandler('sdc');
  secondDrive.insert();

  const result = await apiClient.getAvailableElections();
  expect(result.every((e) => !e.title.startsWith('USB '))).toEqual(true);
});

test('election setting', async () => {
  const election = electionFamousNames2021Fixtures.readElection();
  const { apiClient } = setup();
  // Default election
  const defaultElection = await apiClient.getElection();
  expect(defaultElection).toMatchObject({
    title: electionGeneral.title,
    resolvedPath: expect.any(String),
  });

  await apiClient.setElection({
    inputPath:
      './libs/fixtures/data/electionFamousNames2021/electionGeneratedWithGridLayoutsEnglishOnly.json',
  });
  const updatedElection = await apiClient.getElection();
  expect(updatedElection).toMatchObject({
    title: election.title,
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
  const { apiClient, devDockDir } = setup();

  // Create a zip file containing election.json
  const electionData = JSON.stringify(election);
  const zipBuffer = await zipFile({
    'election.json': electionData,
  });

  const zipPath = makeTemporaryFile({
    postfix: '.zip',
    content: zipBuffer,
  });

  // Load election from zip
  await apiClient.setElection({ inputPath: zipPath });

  const loadedElection = await apiClient.getElection();
  const expectedElectionPath = join(devDockDir, DEV_DOCK_ELECTION_FILE_NAME);
  expect(loadedElection).toMatchObject({
    title: election.title,
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
  expect(parsedElection.jurisdiction).toEqual(election.jurisdiction);

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

  // Without a systemSettings.json in the zip, the poll worker card defaults
  // to no PIN.
  expect(loadedElection?.arePollWorkerCardPinsEnabled).toEqual(false);
  await apiClient.removeCard();
  await apiClient.insertCard({ role: 'poll_worker' });
  await expect(apiClient.getCardStatus()).resolves.toEqual({
    status: 'ready',
    cardDetails: {
      user: mockPollWorkerUser({
        electionKey: constructElectionKey(election),
        jurisdiction: DEV_JURISDICTION,
      }),
      hasPin: false,
    },
  });
});

test('poll worker card has a PIN when the election package enables them', async () => {
  const electionPackage = electionFamousNames2021Fixtures.toElectionPackage({
    ...DEFAULT_SYSTEM_SETTINGS,
    auth: {
      ...DEFAULT_SYSTEM_SETTINGS.auth,
      arePollWorkerCardPinsEnabled: true,
    },
  });
  const { apiClient } = setup();

  const usbDrive = getMockUsbDriveHandler();
  usbDrive.insert(await mockElectionPackageFileTree(electionPackage));

  const available = await apiClient.getAvailableElections();
  const usbOption = available.find((e) => e.title.startsWith('USB '));
  assert(usbOption !== undefined);
  await apiClient.setElection({ inputPath: usbOption.inputPath });

  const loadedElection = await apiClient.getElection();
  expect(loadedElection?.arePollWorkerCardPinsEnabled).toEqual(true);

  await apiClient.removeCard();
  await apiClient.insertCard({ role: 'poll_worker' });
  await expect(apiClient.getCardStatus()).resolves.toEqual({
    status: 'ready',
    cardDetails: {
      user: mockPollWorkerUser({
        electionKey: constructElectionKey(
          electionPackage.electionDefinition.election
        ),
        jurisdiction: DEV_JURISDICTION,
      }),
      hasPin: true,
    },
  });
});

test('usb drive mock endpoints', async () => {
  const { apiClient } = setup();
  await expect(apiClient.getUsbDriveStatus()).resolves.toEqual({
    diskPath: UsbDiskDevPathSchema.decode('/dev/sdb'),
    status: 'removed',
  });

  await apiClient.insertUsbDrive();
  await expect(apiClient.getUsbDriveStatus()).resolves.toEqual({
    diskPath: UsbDiskDevPathSchema.decode('/dev/sdb'),
    status: 'inserted',
  });

  await apiClient.clearUsbDrive();
  await expect(apiClient.getUsbDriveStatus()).resolves.toEqual({
    diskPath: UsbDiskDevPathSchema.decode('/dev/sdb'),
    status: 'inserted',
  });

  await apiClient.removeUsbDrive();
  await expect(apiClient.getUsbDriveStatus()).resolves.toEqual({
    diskPath: UsbDiskDevPathSchema.decode('/dev/sdb'),
    status: 'removed',
  });

  await apiClient.clearUsbDrive();
  await expect(apiClient.getUsbDriveStatus()).resolves.toEqual({
    diskPath: UsbDiskDevPathSchema.decode('/dev/sdb'),
    status: 'removed',
  });
});

test("mounts with a default VxDesign export directory, since apps don't provide one", async () => {
  const app = express();
  useDevDockRouter(
    app,
    express,
    {},
    makeTemporaryDirectory({ prefix: 'dev-dock-test-' })
  );
  server = app.listen();
  const { port } = server.address() as AddressInfo;
  const apiClient = grout.createClient<Api>({
    baseUrl: `http://localhost:${port}/dock`,
  });

  await expect(apiClient.getUsbDriveStatus()).resolves.toMatchObject({
    status: 'removed',
  });
});

async function writeVxDesignElectionPackage(
  designExportDir: string,
  fileName = 'election-package-aaa-111.zip'
): Promise<string> {
  const jurisdictionDir = join(designExportDir, 'dev-jurisdiction-DEMO');
  fs.mkdirSync(jurisdictionDir, { recursive: true });
  const packagePath = join(jurisdictionDir, fileName);
  fs.writeFileSync(
    packagePath,
    await createElectionPackageZipArchive(
      electionFamousNames2021Fixtures.toElectionPackage()
    )
  );
  return packagePath;
}

test('lists the latest VxDesign election package', async () => {
  const designExportDir = makeTemporaryDirectory({
    prefix: 'design-export-test-',
  });
  await writeVxDesignElectionPackage(
    designExportDir,
    'election-package-old.zip'
  );
  const latestPath = await writeVxDesignElectionPackage(
    designExportDir,
    'election-package-new.zip'
  );
  fs.utimesSync(latestPath, new Date('2030-01-01'), new Date('2030-01-01'));

  const { apiClient } = setup(
    {},
    makeTemporaryDirectory({ prefix: 'dev-dock-test-' }),
    designExportDir
  );

  const elections = await apiClient.getAvailableElections();
  expect(elections[0]).toEqual({
    title: 'VxDesign: election-package-new.zip',
    inputPath: latestPath,
  });
});

test('quickConfigure requires an election package to be selected', async () => {
  const { apiClient } = setup();
  await apiClient.setElection({
    inputPath: './libs/fixtures/data/electionGeneral/election.json',
  });

  await expect(apiClient.quickConfigure()).rejects.toThrow();
  await expect(apiClient.getUsbDriveStatus()).resolves.toMatchObject({
    status: 'removed',
  });
});

// Note: This test overwrites the global mock card state.
test('quickConfigure clears the card and unconfigures after staging, before programming the new card', async () => {
  const designExportDir = makeTemporaryDirectory({
    prefix: 'design-export-test-',
  });
  const packagePath = await writeVxDesignElectionPackage(designExportDir);
  const stagedElectionPackagePath = join(
    getMockUsbDriveHandler().getDataPath(),
    QUICK_CONFIGURE_ELECTION_DIR,
    ELECTION_PACKAGE_FOLDER,
    STAGED_ELECTION_PACKAGE_FILE_NAME
  );

  let isPackageStagedAtUnconfigure = false;
  let cardStatusAtUnconfigure: Optional<string>;
  const unconfigure = vi.fn(() => {
    isPackageStagedAtUnconfigure = fs.existsSync(stagedElectionPackagePath);
    cardStatusAtUnconfigure = readFromMockFile().cardStatus.status;
    return Promise.resolve();
  });

  const { apiClient } = setup(
    { quickConfigure: { unconfigure, configure: () => Promise.resolve() } },
    makeTemporaryDirectory({ prefix: 'dev-dock-test-' }),
    designExportDir
  );
  await apiClient.setElection({ inputPath: packagePath });
  await apiClient.insertCard({ role: 'election_manager' });

  // Stand in for the machine mounting the drive, which configuring waits for.
  const platform = new SimulatedUsbPlatform(getMockUsbDirPath());
  const mounter = setInterval(() => {
    const partition = platform
      .getSimulatedDrives()
      .find((drive) => drive.present)?.partition;
    if (partition && !partition.mountpoint) {
      void platform.mountPartition(partition.partPath);
    }
  }, 10);

  await apiClient.quickConfigure();
  clearInterval(mounter);

  expect(unconfigure).toHaveBeenCalledTimes(1);
  expect(isPackageStagedAtUnconfigure).toEqual(true);
  // The stale card is removed first, so the newly unconfigured machine can't
  // try to configure itself before the dock has programmed a matching card.
  expect(cardStatusAtUnconfigure).toEqual('no_card');
});

// Note: This test overwrites the global mock card state.
test('quickConfigure configures the machine once its drive is mounted, then removes the card', async () => {
  const designExportDir = makeTemporaryDirectory({
    prefix: 'design-export-test-',
  });
  const packagePath = await writeVxDesignElectionPackage(designExportDir);

  const usbDriveHandler = getMockUsbDriveHandler();
  const platform = new SimulatedUsbPlatform(getMockUsbDirPath());

  let cardRoleAtConfigure: Optional<string>;
  const configure = vi.fn(() => {
    // Configuring reads the package off the drive, so it has to be mounted by
    // now, with an election manager card inserted to authorize it.
    expect(usbDriveHandler.status().status).toEqual('mounted');
    const { cardStatus } = readFromMockFile();
    cardRoleAtConfigure =
      cardStatus.status === 'ready'
        ? cardStatus.cardDetails.user?.role
        : undefined;
    return Promise.resolve();
  });

  const { apiClient } = setup(
    { quickConfigure: { unconfigure: () => Promise.resolve(), configure } },
    makeTemporaryDirectory({ prefix: 'dev-dock-test-' }),
    designExportDir
  );
  await apiClient.setElection({ inputPath: packagePath });

  // Stand in for the machine, which mounts an attached drive asynchronously.
  // The delay outlasts the rest of the sequence, so quick configure has to wait
  // for the mount rather than configuring as soon as it attaches the drive.
  const mountDelay = setTimeout(() => {
    const partition = platform
      .getSimulatedDrives()
      .find((drive) => drive.present)?.partition;
    assert(partition);
    void platform.mountPartition(partition.partPath);
  }, 1_500);

  await apiClient.quickConfigure();
  clearTimeout(mountDelay);

  expect(configure).toHaveBeenCalledTimes(1);
  expect(cardRoleAtConfigure).toEqual('election_manager');
  await expect(apiClient.getCardStatus()).resolves.toEqual({
    status: 'no_card',
  });
});

test('quickConfigure rejects apps that do not support it', async () => {
  const designExportDir = makeTemporaryDirectory({
    prefix: 'design-export-test-',
  });
  const packagePath = await writeVxDesignElectionPackage(designExportDir);

  const { apiClient } = setup(
    {},
    makeTemporaryDirectory({ prefix: 'dev-dock-test-' }),
    designExportDir
  );
  await apiClient.setElection({ inputPath: packagePath });

  // Configuring is the point, so an app that can't be configured shouldn't be
  // left with a staged package and a card it never used.
  await expect(apiClient.quickConfigure()).rejects.toThrow();
  await expect(apiClient.getUsbDriveStatus()).resolves.toMatchObject({
    status: 'removed',
  });
});

// Note: This test overwrites the global mock card state.
test('quickConfigure stages the selected election package and keeps it selected', async () => {
  const designExportDir = makeTemporaryDirectory({
    prefix: 'design-export-test-',
  });
  const packagePath = await writeVxDesignElectionPackage(designExportDir);
  const electionPackage = electionFamousNames2021Fixtures.toElectionPackage();

  let cardDetailsAtConfigure: Optional<CardStatus>;
  const { apiClient, devDockDir } = setup(
    {
      quickConfigure: {
        unconfigure: () => Promise.resolve(),
        configure: () => {
          cardDetailsAtConfigure = readFromMockFile().cardStatus;
          return Promise.resolve();
        },
      },
    },
    makeTemporaryDirectory({ prefix: 'dev-dock-test-' }),
    designExportDir
  );
  await apiClient.setElection({ inputPath: packagePath });

  // Stand in for the machine mounting the drive, which configuring waits for.
  const platform = new SimulatedUsbPlatform(getMockUsbDirPath());
  const mounter = setInterval(() => {
    const partition = platform
      .getSimulatedDrives()
      .find((drive) => drive.present)?.partition;
    if (partition && !partition.mountpoint) {
      void platform.mountPartition(partition.partPath);
    }
  }, 10);

  await apiClient.quickConfigure();
  clearInterval(mounter);

  await expect(apiClient.getUsbDriveStatus()).resolves.toMatchObject({
    status: 'inserted',
  });

  // The machine finds the staged copy on the drive using its own reader.
  const usbDriveDataPath = getMockUsbDriveHandler().getDataPath();
  const foundPath =
    await getMostRecentElectionPackageFilepath(usbDriveDataPath);
  expect(foundPath.unsafeUnwrap()).toEqual(
    join(
      usbDriveDataPath,
      QUICK_CONFIGURE_ELECTION_DIR,
      ELECTION_PACKAGE_FOLDER,
      STAGED_ELECTION_PACKAGE_FILE_NAME
    )
  );

  // The selection still points at what the developer picked, not the staged
  // copy, so the dev dock keeps showing their choice.
  await expect(apiClient.getElection()).resolves.toEqual({
    title: electionPackage.electionDefinition.election.title,
    inputPath: packagePath,
    resolvedPath: join(devDockDir, DEV_DOCK_ELECTION_FILE_NAME),
    arePollWorkerCardPinsEnabled: false,
    isElectionPackage: true,
  });

  // The card used to configure matches the package that was staged.
  expect(cardDetailsAtConfigure).toEqual({
    status: 'ready',
    cardDetails: {
      user: mockElectionManagerUser({
        electionKey: constructElectionKey(
          electionPackage.electionDefinition.election
        ),
        jurisdiction: DEV_JURISDICTION,
      }),
    },
  });
  await expect(apiClient.getCardStatus()).resolves.toEqual({
    status: 'no_card',
  });
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
    hasQuickConfigure: false,
  });

  const { apiClient: apiClient2 } = setup({
    printerConfig: 'fujitsu',
    getAccessibleControllerConnected: vi.fn(),
    setAccessibleControllerConnected: vi.fn(),
    getBarcodeConnected: vi.fn(),
    setBarcodeConnected: vi.fn(),
    getPatInputConnected: vi.fn(),
    setPatInputConnected: vi.fn(),
    quickConfigure: {
      unconfigure: () => Promise.resolve(),
      configure: () => Promise.resolve(),
    },
  });
  expect(await apiClient2.getMockSpec()).toEqual({
    mockPdiScanner: false,
    mockBatchScanner: false,
    printerConfig: 'fujitsu',
    hasAccessibleControllerMock: true,
    hasBarcodeMock: true,
    hasPatInputMock: true,
    hasQuickConfigure: true,
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
  const { apiClient } = setup({ printerConfig: HP_4001_PRINTER_CONFIG });
  await expect(apiClient.getPrinterStatus()).resolves.toEqual(
    typedAs<PrinterStatus>({
      connected: false,
    })
  );

  await apiClient.connectPrinter();
  await expect(apiClient.getPrinterStatus()).resolves.toEqual(
    typedAs<PrinterStatus>(
      getMockConnectedPrinterStatus(HP_4001_PRINTER_CONFIG)
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

test('mock PDI scanner - single sheet', async () => {
  const mockPdiScanner = createMockPdiScanner();
  const { apiClient } = setup({ mockPdiScanner });

  (await mockPdiScanner.client.connect()).unsafeUnwrap();
  (
    await mockPdiScanner.client.enableScanning({
      doubleFeedDetectionEnabled: false,
      paperLengthInches: 11,
    })
  ).unsafeUnwrap();

  expect(await apiClient.pdiScannerGetStatus()).toEqual<PdiScannerStatus>({
    sheetStatus: 'noSheetEnabled',
    queue: undefined,
  });

  const scanCompletePromise = new Promise<void>((resolve) => {
    const listener = mockPdiScanner.client.addListener((event) => {
      if (event.event === 'scanComplete') {
        mockPdiScanner.client.removeListener(listener);
        resolve();
      }
    });
  });
  await apiClient.pdiScannerInsertSheets({
    path: vxFamousNamesFixtures.markedBallotPath,
  });
  expect(await apiClient.pdiScannerGetStatus()).toEqual({
    sheetStatus: 'sheetInserted',
    queue: {
      total: 1,
      inserted: 1,
    },
  });
  await scanCompletePromise;

  (await mockPdiScanner.client.ejectDocument('toFrontAndHold')).unsafeUnwrap();
  await backendWaitFor(
    async () =>
      expect((await apiClient.pdiScannerGetStatus()).sheetStatus).toEqual(
        'sheetHeldInFront'
      ),
    { interval: 500 }
  );
  await apiClient.pdiScannerRemoveSheet();
  expect((await apiClient.pdiScannerGetStatus()).sheetStatus).toEqual(
    'noSheetDisabled'
  );

  // Re-enable scanning so the queue interval detects exhaustion and auto-clears
  (
    await mockPdiScanner.client.enableScanning({
      doubleFeedDetectionEnabled: false,
      paperLengthInches: 11,
    })
  ).unsafeUnwrap();
  await backendWaitFor(
    async () =>
      expect((await apiClient.pdiScannerGetStatus()).queue).toBeUndefined(),
    { interval: 500 }
  );
});

test(
  'mock PDI scanner - multi-sheet queue with ballot return',
  { timeout: 30_000 },
  async () => {
    const mockPdiScanner = createMockPdiScanner();
    const { apiClient } = setup({ mockPdiScanner });

    (await mockPdiScanner.client.connect()).unsafeUnwrap();
    (
      await mockPdiScanner.client.enableScanning({
        doubleFeedDetectionEnabled: false,
        paperLengthInches: 11,
      })
    ).unsafeUnwrap();

    let scanCompleteCount = 0;
    mockPdiScanner.client.addListener((event) => {
      if (event.event === 'scanComplete') scanCompleteCount += 1;
    });

    // Use the electionGeneral letter fixture which is a multi-sheet ballot
    const letterFixture = vxGeneralElectionFixtures.fixtureSpecs.find(
      (spec) => spec.paperSize === 'letter'
    );
    assert(letterFixture !== undefined);
    const multiSheetPath = letterFixture.markedBallotPath;
    await apiClient.pdiScannerInsertSheets({ path: multiSheetPath });

    const initialStatus = await apiClient.pdiScannerGetStatus();
    expect(initialStatus.queue).toBeDefined();
    expect(initialStatus.queue!.total).toBeGreaterThan(1);
    expect(initialStatus.queue!.inserted).toEqual(1);

    // Wait for first sheet to complete scanning
    await backendWaitFor(() => expect(scanCompleteCount).toEqual(1), {
      interval: 500,
    });

    // Eject first sheet to front (simulating ballot return to voter)
    (
      await mockPdiScanner.client.ejectDocument('toFrontAndHold')
    ).unsafeUnwrap();
    await backendWaitFor(
      async () =>
        expect((await apiClient.pdiScannerGetStatus()).sheetStatus).toEqual(
          'sheetHeldInFront'
        ),
      { interval: 500 }
    );

    // Voter removes the returned ballot
    await apiClient.pdiScannerRemoveSheet();
    await backendWaitFor(
      async () =>
        expect((await apiClient.pdiScannerGetStatus()).sheetStatus).toEqual(
          'noSheetDisabled'
        ),
      { interval: 500 }
    );

    // Re-enable scanning so the queue interval can insert the next sheet
    (
      await mockPdiScanner.client.enableScanning({
        doubleFeedDetectionEnabled: false,
        paperLengthInches: 11,
      })
    ).unsafeUnwrap();

    // Wait for second sheet to be inserted and scanned
    await backendWaitFor(() => expect(scanCompleteCount).toEqual(2), {
      interval: 500,
    });

    // Clear the remaining queue rather than scanning all sheets
    await apiClient.pdiScannerClearSheetQueue();
    expect((await apiClient.pdiScannerGetStatus()).queue).toBeUndefined();
  }
);

test('mock PDI scanner - clear sheet queue', async () => {
  const mockPdiScanner = createMockPdiScanner();
  const { apiClient } = setup({ mockPdiScanner });

  (await mockPdiScanner.client.connect()).unsafeUnwrap();
  (
    await mockPdiScanner.client.enableScanning({
      doubleFeedDetectionEnabled: false,
      paperLengthInches: 11,
    })
  ).unsafeUnwrap();

  // Add a no-op listener so the mock scanner doesn't throw
  mockPdiScanner.client.addListener(() => {});

  await apiClient.pdiScannerInsertSheets({
    path: vxFamousNamesFixtures.markedBallotPath,
  });

  await apiClient.pdiScannerClearSheetQueue();

  expect((await apiClient.pdiScannerGetStatus()).queue).toBeUndefined();
});

test('mock PDI scanner - clear sheet queue with sheet held in front', async () => {
  const mockPdiScanner = createMockPdiScanner();
  const { apiClient } = setup({ mockPdiScanner });

  (await mockPdiScanner.client.connect()).unsafeUnwrap();
  (
    await mockPdiScanner.client.enableScanning({
      doubleFeedDetectionEnabled: false,
      paperLengthInches: 11,
    })
  ).unsafeUnwrap();

  const scanCompletePromise = new Promise<void>((resolve) => {
    const listener = mockPdiScanner.client.addListener((event) => {
      if (event.event === 'scanComplete') {
        mockPdiScanner.client.removeListener(listener);
        resolve();
      }
    });
  });

  await apiClient.pdiScannerInsertSheets({
    path: vxFamousNamesFixtures.markedBallotPath,
  });
  await scanCompletePromise;

  // Eject to front and hold
  (await mockPdiScanner.client.ejectDocument('toFrontAndHold')).unsafeUnwrap();
  await backendWaitFor(
    async () =>
      expect((await apiClient.pdiScannerGetStatus()).sheetStatus).toEqual(
        'sheetHeldInFront'
      ),
    { interval: 500 }
  );

  // Clear the queue while sheet is held — should also remove the sheet
  await apiClient.pdiScannerClearSheetQueue();

  expect((await apiClient.pdiScannerGetStatus()).queue).toBeUndefined();
  await backendWaitFor(
    async () =>
      expect((await apiClient.pdiScannerGetStatus()).sheetStatus).toEqual(
        'noSheetDisabled'
      ),
    { interval: 500 }
  );
});

test('mock PDI scanner - odd-page PDF gets blank back', async () => {
  const mockPdiScanner = createMockPdiScanner();
  const { apiClient } = setup({ mockPdiScanner });

  (await mockPdiScanner.client.connect()).unsafeUnwrap();
  (
    await mockPdiScanner.client.enableScanning({
      doubleFeedDetectionEnabled: false,
      paperLengthInches: 11,
    })
  ).unsafeUnwrap();

  mockPdiScanner.client.addListener(() => {});

  const pdfPath = makeTemporaryFile({
    postfix: '.pdf',
    content: SINGLE_PAGE_PDF,
  });

  await apiClient.pdiScannerInsertSheets({ path: pdfPath });

  // Should successfully insert the sheet with a generated blank back
  expect((await apiClient.pdiScannerGetStatus()).sheetStatus).toEqual(
    'sheetInserted'
  );
  expect((await apiClient.pdiScannerGetStatus()).queue).toEqual({
    total: 1,
    inserted: 1,
  });
});

function createMockBatchScanner(imageDir: string): MockBatchScannerApi {
  let sheets: Array<{ frontPath: string; backPath: string }> = [];
  let copies = 1;
  let errorQueued = false;
  return {
    imageDir,
    addSheets(newSheets) {
      sheets.push(...newSheets);
    },
    getStatus() {
      return { sheetCount: sheets.length * copies, errorQueued };
    },
    clearSheets() {
      sheets = [];
      errorQueued = false;
    },
    setCopies(newCopies) {
      copies = newCopies;
    },
    setErrorQueued(newErrorQueued) {
      errorQueued = newErrorQueued;
    },
  };
}

test('mock batch scanner - get status', async () => {
  const devDockDir = makeTemporaryDirectory({ prefix: 'dev-dock-test-' });
  const mockBatchScanner = createMockBatchScanner(devDockDir);
  const { apiClient } = setup({ mockBatchScanner }, devDockDir);
  expect(await apiClient.batchScannerGetStatus()).toEqual({
    sheetCount: 0,
    errorQueued: false,
  });
});

test('mock batch scanner - queue and cancel an error', async () => {
  const devDockDir = makeTemporaryDirectory({ prefix: 'dev-dock-test-' });
  const mockBatchScanner = createMockBatchScanner(devDockDir);
  const { apiClient } = setup({ mockBatchScanner }, devDockDir);

  await apiClient.batchScannerSetErrorQueued({ errorQueued: true });
  expect(await apiClient.batchScannerGetStatus()).toEqual({
    sheetCount: 0,
    errorQueued: true,
  });

  await apiClient.batchScannerSetErrorQueued({ errorQueued: false });
  expect(await apiClient.batchScannerGetStatus()).toEqual({
    sheetCount: 0,
    errorQueued: false,
  });
});

test('mock batch scanner - set copies scales the queued sheets', async () => {
  const devDockDir = makeTemporaryDirectory({ prefix: 'dev-dock-test-' });
  const mockBatchScanner = createMockBatchScanner(devDockDir);
  const { apiClient } = setup({ mockBatchScanner }, devDockDir);

  await apiClient.batchScannerLoadBallots({
    paths: [vxFamousNamesFixtures.markedBallotPath],
  });
  const { sheetCount: singleCopySheetCount } =
    await apiClient.batchScannerGetStatus();
  expect(singleCopySheetCount).toBeGreaterThan(0);

  await apiClient.batchScannerSetCopies({ copies: 3 });
  expect(await apiClient.batchScannerGetStatus()).toEqual({
    sheetCount: singleCopySheetCount * 3,
    errorQueued: false,
  });

  await apiClient.batchScannerSetCopies({ copies: 1 });
  expect(await apiClient.batchScannerGetStatus()).toEqual({
    sheetCount: singleCopySheetCount,
    errorQueued: false,
  });
});

test('mock batch scanner - load ballots from PDF', async () => {
  const devDockDir = makeTemporaryDirectory({ prefix: 'dev-dock-test-' });
  const mockBatchScanner = createMockBatchScanner(devDockDir);
  const { apiClient } = setup({ mockBatchScanner }, devDockDir);

  await apiClient.batchScannerLoadBallots({
    paths: [vxFamousNamesFixtures.markedBallotPath],
  });

  const status = await apiClient.batchScannerGetStatus();
  expect(status.sheetCount).toBeGreaterThan(0);
});

test('mock batch scanner - clear ballots', async () => {
  const devDockDir = makeTemporaryDirectory({ prefix: 'dev-dock-test-' });
  const mockBatchScanner = createMockBatchScanner(devDockDir);
  const { apiClient } = setup({ mockBatchScanner }, devDockDir);

  await apiClient.batchScannerLoadBallots({
    paths: [vxFamousNamesFixtures.markedBallotPath],
  });
  expect((await apiClient.batchScannerGetStatus()).sheetCount).toBeGreaterThan(
    0
  );

  await apiClient.batchScannerClearBallots();
  expect(await apiClient.batchScannerGetStatus()).toEqual({
    sheetCount: 0,
    errorQueued: false,
  });
});

test('mock batch scanner - load image files as front/back pairs', async () => {
  const devDockDir = makeTemporaryDirectory({ prefix: 'dev-dock-test-' });
  const mockBatchScanner = createMockBatchScanner(devDockDir);
  const { apiClient } = setup({ mockBatchScanner }, devDockDir);

  // Create two small test images in the batch scanner's image dir
  const img1 = join(mockBatchScanner.imageDir, 'front.jpg');
  const img2 = join(mockBatchScanner.imageDir, 'back.jpg');
  const { createImageData, writeImageData } = await import(
    '@votingworks/image-utils'
  );
  await writeImageData(img1, createImageData(10, 10));
  await writeImageData(img2, createImageData(10, 10));

  await apiClient.batchScannerLoadBallots({ paths: [img1, img2] });
  expect(await apiClient.batchScannerGetStatus()).toEqual({
    sheetCount: 1,
    errorQueued: false,
  });
});

test('mock batch scanner - odd image gets a blank back', async () => {
  const devDockDir = makeTemporaryDirectory({ prefix: 'dev-dock-test-' });
  const mockBatchScanner = createMockBatchScanner(devDockDir);
  const { apiClient } = setup({ mockBatchScanner }, devDockDir);

  const img = join(mockBatchScanner.imageDir, 'single.jpg');
  const { createImageData, writeImageData } = await import(
    '@votingworks/image-utils'
  );
  await writeImageData(img, createImageData(10, 10));

  await apiClient.batchScannerLoadBallots({ paths: [img] });
  expect(await apiClient.batchScannerGetStatus()).toEqual({
    sheetCount: 1,
    errorQueued: false,
  });
});

test('mock batch scanner - single page PDF gets blank back', async () => {
  const devDockDir = makeTemporaryDirectory({ prefix: 'dev-dock-test-' });
  const mockBatchScanner = createMockBatchScanner(devDockDir);
  const { apiClient } = setup({ mockBatchScanner }, devDockDir);

  const pdfPath = join(mockBatchScanner.imageDir, 'single-page.pdf');
  fs.writeFileSync(pdfPath, SINGLE_PAGE_PDF);

  await apiClient.batchScannerLoadBallots({ paths: [pdfPath] });
  expect(await apiClient.batchScannerGetStatus()).toEqual({
    sheetCount: 1,
    errorQueued: false,
  });
});

test('mock batch scanner - mock spec reports mockBatchScanner', async () => {
  const devDockDir = makeTemporaryDirectory({ prefix: 'dev-dock-test-' });
  const mockBatchScanner = createMockBatchScanner(devDockDir);
  const { apiClient } = setup({ mockBatchScanner }, devDockDir);
  const spec = await apiClient.getMockSpec();
  expect(spec.mockBatchScanner).toEqual(true);
});
