import type Express from 'express';
import * as grout from '@votingworks/grout';
import * as fs from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, extname, isAbsolute, relative } from 'node:path';
import { Optional, assert, assertDefined, iter } from '@votingworks/basics';
import {
  asSheet,
  PrinterConfig,
  PrinterStatus,
  safeParseElectionDefinition,
  UserRole,
} from '@votingworks/types';
import {
  CardStatus,
  readFromMockFile as readFromCardMockFile,
} from '@votingworks/auth';
import {
  isFeatureFlagEnabled,
  BooleanEnvironmentVariableName,
  openZip,
  getEntries,
  getFileByName,
  readTextEntry,
} from '@votingworks/utils';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import {
  getMockFileFujitsuPrinterHandler,
  PrinterStatus as FujitsuPrinterStatus,
} from '@votingworks/fujitsu-thermal-printer';
import { getMockFilePrinterHandler } from '@votingworks/printing';
import { writeFile } from 'node:fs/promises';
import { MockScanner, MockSheetStatus } from '@votingworks/pdi-scanner';
import {
  createImageData,
  loadImageData,
  pdfToImages,
  writeImageData,
} from '@votingworks/image-utils';
import { execFile } from './utils';

export interface MockBatchScannerApi {
  addSheets(sheets: Array<{ frontPath: string; backPath: string }>): void;
  getStatus(): { sheetCount: number };
  clearSheets(): void;
}

export type DevDockUserRole = Exclude<UserRole, 'cardless_voter'>;
export type DevDockUsbDriveStatus = 'inserted' | 'removed';
export interface DevDockElectionInfo {
  title: string;
  /** The path that appears in the file picker and is passed to the backend */
  inputPath: string;
  /** The actual path to the election.json file (may be extracted from zip to temp file) */
  resolvedPath: string;
}

export const DEFAULT_DEV_DOCK_ELECTION_INPUT_PATH =
  './libs/fixtures/data/electionGeneral/election.json';

// Convert paths relative to the VxSuite root to absolute paths
export function electionPathToAbsolute(path: string): string {
  return isAbsolute(path)
    ? /* istanbul ignore next */
      path
    : join(__dirname, '../../../..', path);
}

function electionAbsolutePathToRelative(absolutePath: string): string {
  return `./${relative(join(__dirname, '../../../..'), absolutePath)}`;
}

const MOCK_CARD_SCRIPT_PATH = join(
  __dirname,
  '../../../auth/scripts/mock-card'
);

// Create a stable directory for dev-dock data
export const DEFAULT_DEV_DOCK_DIR = join(homedir(), '.vx-dev-dock');
export const DEV_DOCK_FILE_NAME = 'dev-dock.json';
export const DEFAULT_DEV_DOCK_FILE_PATH = join(
  DEFAULT_DEV_DOCK_DIR,
  DEV_DOCK_FILE_NAME
);
export const DEV_DOCK_ELECTION_FILE_NAME = 'election.json';
export const DEV_DOCK_ELECTION_PATH = join(
  DEFAULT_DEV_DOCK_DIR,
  'election.json'
);
interface DevDockFileContents {
  electionInfo?: DevDockElectionInfo;
}

function writeDevDockFileContents(
  devDockFilePath: string,
  fileContents: DevDockFileContents
): void {
  return fs.writeFileSync(devDockFilePath, JSON.stringify(fileContents));
}

function readDevDockFileContents(devDockFilePath: string): DevDockFileContents {
  return JSON.parse(
    fs.readFileSync(devDockFilePath, { encoding: 'utf-8' })
  ) as DevDockFileContents;
}

export interface MockSpec {
  printerConfig?: PrinterConfig | 'fujitsu';
  mockPdiScanner?: MockScanner;
  mockBatchScanner?: MockBatchScannerApi;
  // Optional hardware mocks provided by the host app
  getBarcodeConnected?: () => boolean;
  setBarcodeConnected?: (connected: boolean) => void;
  getPatInputConnected?: () => boolean;
  setPatInputConnected?: (connected: boolean) => void;
  getAccessibleControllerConnected?: () => boolean;
  setAccessibleControllerConnected?: (connected: boolean) => void;
}

interface SerializableMockSpec
  extends Omit<
    MockSpec,
    | 'mockPdiScanner'
    | 'mockBatchScanner'
    | 'setBarcodeConnected'
    | 'setAccessibleControllerConnected'
    | 'setPatInputConnected'
    | 'getBarcodeConnected'
    | 'getAccessibleControllerConnected'
    | 'getPatInputConnected'
  > {
  mockPdiScanner?: boolean;
  mockBatchScanner?: boolean;
  hasBarcodeMock?: boolean;
  hasPatInputMock?: boolean;
  hasAccessibleControllerMock?: boolean;
}

async function setElection(
  inputPath: string,
  devDockDir: string
): Promise<void> {
  const inputAbsolutePath = electionPathToAbsolute(inputPath);
  let electionData: string;
  let resolvedPath: string | undefined;

  // Check if the file is a zip file
  if (extname(inputAbsolutePath).toLowerCase() === '.zip') {
    // Read the zip file
    const zipContents = fs.readFileSync(inputAbsolutePath);
    const zipFile = await openZip(zipContents);
    const entries = getEntries(zipFile);

    // Find and read election.json from the zip
    const electionEntry = getFileByName(
      entries,
      'election.json',
      inputAbsolutePath
    );
    electionData = await readTextEntry(electionEntry);

    // Extract election.json to a stable directory for use by other scripts
    const devDockElectionPath = join(devDockDir, DEV_DOCK_ELECTION_FILE_NAME);
    fs.writeFileSync(devDockElectionPath, electionData, 'utf-8');
    resolvedPath = devDockElectionPath;
  } else {
    // Read directly as JSON file
    electionData = fs.readFileSync(inputAbsolutePath, 'utf-8');
    resolvedPath = inputAbsolutePath;
  }

  const electionDefinition =
    safeParseElectionDefinition(electionData).unsafeUnwrap();
  const electionInfo: DevDockElectionInfo = {
    title: electionDefinition.election.title,
    inputPath,
    resolvedPath,
  };

  const devDockFilePath = join(devDockDir, DEV_DOCK_FILE_NAME);
  writeDevDockFileContents(devDockFilePath, {
    electionInfo,
  });
}

function getElection(devDockDir: string): Optional<DevDockElectionInfo> {
  return readDevDockFileContents(join(devDockDir, DEV_DOCK_FILE_NAME))
    .electionInfo;
}

function buildApi(devDockDir: string, mockSpec: MockSpec) {
  const usbHandler = getMockFileUsbDriveHandler();
  const printerHandler = getMockFilePrinterHandler();
  const fujitsuPrinterHandler = getMockFileFujitsuPrinterHandler();

  return grout.createApi({
    getMockSpec(): SerializableMockSpec {
      return {
        printerConfig: mockSpec.printerConfig,
        mockPdiScanner: Boolean(mockSpec.mockPdiScanner),
        mockBatchScanner: Boolean(mockSpec.mockBatchScanner),
        hasBarcodeMock:
          Boolean(mockSpec.getBarcodeConnected) &&
          Boolean(mockSpec.setBarcodeConnected),
        hasAccessibleControllerMock:
          Boolean(mockSpec.getAccessibleControllerConnected) &&
          Boolean(mockSpec.setAccessibleControllerConnected),
        hasPatInputMock:
          Boolean(mockSpec.getPatInputConnected) &&
          Boolean(mockSpec.setPatInputConnected),
      };
    },

    async setElection(input: { inputPath: string }): Promise<void> {
      await setElection(input.inputPath, devDockDir);
    },

    getElection(): Optional<DevDockElectionInfo> {
      return getElection(devDockDir);
    },

    getCurrentFixtureElectionPaths(): DevDockElectionInfo[] {
      const baseFixturePath = join(__dirname, '../../../../libs/fixtures/data');
      return fs
        .readdirSync(baseFixturePath, {
          withFileTypes: true,
        })
        .filter((item) => item.isDirectory())
        .map((item) => {
          const filesInDir = fs.readdirSync(join(baseFixturePath, item.name));
          const electionFile = filesInDir.find((file) =>
            /^(electionGenerated.*|election)\.json$/.test(file)
          );
          if (electionFile) {
            const resolvedPath = join(baseFixturePath, item.name, electionFile);
            return {
              title: item.name,
              inputPath: electionAbsolutePathToRelative(resolvedPath),
              resolvedPath,
            };
          }
          return undefined;
        })
        .filter((item) => item !== undefined);
    },

    getCardStatus(): CardStatus {
      return readFromCardMockFile().cardStatus;
    },

    async insertCard(input: { role: DevDockUserRole }): Promise<void> {
      const devDockFilePath = join(devDockDir, DEV_DOCK_FILE_NAME);
      const { electionInfo } = readDevDockFileContents(devDockFilePath);
      assert(electionInfo !== undefined);

      await execFile(MOCK_CARD_SCRIPT_PATH, [
        '--card-type',
        input.role.replace('_', '-'),
        '--electionDefinition',
        electionInfo.resolvedPath,
      ]);
    },

    async removeCard(): Promise<void> {
      await execFile(MOCK_CARD_SCRIPT_PATH, ['--card-type', 'no-card']);
    },

    getUsbDriveStatus(): DevDockUsbDriveStatus {
      return usbHandler.status().status === 'mounted' ? 'inserted' : 'removed';
    },

    insertUsbDrive(): void {
      usbHandler.insert();
    },

    removeUsbDrive(): void {
      usbHandler.remove();
    },

    clearUsbDrive(): void {
      usbHandler.clearData();
    },

    async saveScreenshotForApp({
      fileName,
      screenshot,
    }: {
      fileName: string;
      screenshot: Uint8Array;
    }): Promise<void> {
      const downloadsPath = join(homedir(), 'Downloads');
      await writeFile(join(downloadsPath, fileName), screenshot);
    },

    getPrinterStatus(): PrinterStatus {
      return printerHandler.getPrinterStatus();
    },

    connectPrinter(): void {
      assert(
        mockSpec.printerConfig !== undefined &&
          mockSpec.printerConfig !== 'fujitsu'
      );
      printerHandler.connectPrinter(mockSpec.printerConfig);
    },

    disconnectPrinter(): void {
      printerHandler.disconnectPrinter();
    },

    getFujitsuPrinterStatus(): FujitsuPrinterStatus {
      assert(mockSpec.printerConfig === 'fujitsu');
      return fujitsuPrinterHandler.getPrinterStatus();
    },

    setFujitsuPrinterStatus(status: FujitsuPrinterStatus): void {
      fujitsuPrinterHandler.setStatus(status);
    },

    // Hardware mock controls: barcode + accessible PAT controller
    getHardwareMockStatus(): {
      barcodeConnected: boolean;
      accessibleControllerConnected: boolean;
      patInputConnected: boolean;
    } {
      const barcodeConnected = mockSpec.getBarcodeConnected
        ? mockSpec.getBarcodeConnected()
        : false;
      const accessibleControllerConnected =
        mockSpec.getAccessibleControllerConnected
          ? mockSpec.getAccessibleControllerConnected()
          : false;
      const patInputConnected = mockSpec.getPatInputConnected
        ? mockSpec.getPatInputConnected()
        : false;
      return {
        barcodeConnected,
        accessibleControllerConnected,
        patInputConnected,
      };
    },

    setBarcodeConnected(input: { connected: boolean }): void {
      mockSpec.setBarcodeConnected?.(input.connected);
    },

    setAccessibleControllerConnected(input: { connected: boolean }): void {
      mockSpec.setAccessibleControllerConnected?.(input.connected);
    },

    setPatInputConnected(input: { connected: boolean }): void {
      mockSpec.setPatInputConnected?.(input.connected);
    },

    pdiScannerGetSheetStatus(): MockSheetStatus {
      return assertDefined(mockSpec.mockPdiScanner).getSheetStatus();
    },

    async pdiScannerInsertSheet(input: { path: string }): Promise<void> {
      const pdfData = Uint8Array.from(fs.readFileSync(input.path));
      const images = await iter(pdfToImages(pdfData, { scale: 200 / 72 }))
        .map(({ page }) => page)
        .toArray();
      assertDefined(mockSpec.mockPdiScanner).insertSheet(
        asSheet(images.slice(0, 2))
      );
    },

    pdiScannerRemoveSheet(): void {
      assertDefined(mockSpec.mockPdiScanner).removeSheet();
    },

    batchScannerGetStatus(): { sheetCount: number } {
      return assertDefined(mockSpec.mockBatchScanner).getStatus();
    },

    async batchScannerLoadBallots(input: { paths: string[] }): Promise<void> {
      const batchScanner = assertDefined(mockSpec.mockBatchScanner);
      const sheets: Array<{ frontPath: string; backPath: string }> = [];
      let fileIndex = 0;

      function nextTmpPath(): string {
        fileIndex += 1;
        return join(tmpdir(), `dev-dock-batch-${Date.now()}-${fileIndex}.jpg`);
      }

      const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png'];
      const imageFilePaths: string[] = [];

      for (const filePath of input.paths) {
        const ext = extname(filePath).toLowerCase();

        if (IMAGE_EXTENSIONS.includes(ext)) {
          imageFilePaths.push(filePath);
        } else {
          // Treat as PDF
          const pdfData = Uint8Array.from(fs.readFileSync(filePath));
          const images = await iter(pdfToImages(pdfData, { scale: 200 / 72 }))
            .map(({ page }) => page)
            .toArray();

          for (let i = 0; i < images.length; i += 2) {
            const frontImage = assertDefined(images[i]);
            const backImage = images[i + 1];

            const frontPath = nextTmpPath();
            await writeImageData(frontPath, frontImage);

            const backPath = nextTmpPath();
            if (backImage) {
              await writeImageData(backPath, backImage);
            } else {
              await writeImageData(
                backPath,
                createImageData(frontImage.width, frontImage.height)
              );
            }

            sheets.push({ frontPath, backPath });
          }
        }
      }

      // Pair image files as front/back, 2 at a time
      for (let i = 0; i < imageFilePaths.length; i += 2) {
        const frontPath = assertDefined(imageFilePaths[i]);
        const backPath = imageFilePaths[i + 1];

        if (backPath) {
          sheets.push({ frontPath, backPath });
        } else {
          // Odd image: generate a blank back
          const frontResult = (await loadImageData(frontPath)).unsafeUnwrap();
          const blankBackPath = nextTmpPath();
          await writeImageData(
            blankBackPath,
            createImageData(frontResult.width, frontResult.height)
          );
          sheets.push({ frontPath, backPath: blankBackPath });
        }
      }

      batchScanner.addSheets(sheets);
    },

    batchScannerClearBallots(): void {
      assertDefined(mockSpec.mockBatchScanner).clearSheets();
    },
  });
}

/**
 * A type to be used by the frontend to create a Grout API client
 */
export type Api = ReturnType<typeof buildApi>;

/**
 * Mounts the Dev Dock API endpoints at /dock.
 */
export function useDevDockRouter(
  app: Express.Application,
  express: typeof Express,
  mockSpec: MockSpec,
  /* istanbul ignore next */
  devDockDir: string = DEFAULT_DEV_DOCK_DIR
): void {
  if (!isFeatureFlagEnabled(BooleanEnvironmentVariableName.ENABLE_DEV_DOCK)) {
    return;
  }

  // Create dev dock dir and file if it doesn't exist so we can always read from it
  if (!fs.existsSync(devDockDir)) {
    fs.mkdirSync(devDockDir, { recursive: true });
  }

  const devDockFilePath = join(devDockDir, DEV_DOCK_FILE_NAME);
  if (!fs.existsSync(devDockFilePath)) {
    writeDevDockFileContents(devDockFilePath, {});
  }

  const api = buildApi(devDockDir, mockSpec);

  // Set a default election if one is not already set
  if (!getElection(devDockDir)) {
    void setElection(DEFAULT_DEV_DOCK_ELECTION_INPUT_PATH, devDockDir);
  }

  const dockRouter = grout.buildRouter(api, express);
  app.use('/dock', dockRouter);
}
