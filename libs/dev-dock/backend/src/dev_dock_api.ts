import type Express from 'express';
import * as grout from '@votingworks/grout';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, extname } from 'node:path';
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
import { pdfToImages } from '@votingworks/image-utils';
import { execFile } from './utils';

export type DevDockUserRole = Exclude<UserRole, 'cardless_voter'>;
export type DevDockUsbDriveStatus = 'inserted' | 'removed';
export interface DevDockElectionInfo {
  title: string;
  path: string;
  /** The actual path to the election.json file (may be extracted from zip to temp file) */
  resolvedPath?: string;
}

// Convert paths relative to the VxSuite root to absolute paths
function electionPathToAbsolute(path: string) {
  return isAbsolute(path)
    ? /* istanbul ignore next */
      path
    : join(__dirname, '../../../..', path);
}

const MOCK_CARD_SCRIPT_PATH = join(
  __dirname,
  '../../../auth/scripts/mock-card'
);

// Create a stable directory for dev-dock data
const DEV_DOCK_DIR = join(homedir(), '.vx-dev-dock');
export const DEV_DOCK_FILE_PATH = '/tmp/dev-dock.json';
const DEV_DOCK_ELECTION_PATH = join(DEV_DOCK_DIR, 'election.json');
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
}

interface SerializableMockSpec extends Omit<MockSpec, 'mockPdiScanner'> {
  mockPdiScanner?: boolean;
}

async function setElection(
  path: string,
  devDockFilePath: string
): Promise<void> {
  const absolutePath = electionPathToAbsolute(path);
  let electionData: string;
  let resolvedPath: string | undefined;

  // Check if the file is a zip file
  if (extname(absolutePath).toLowerCase() === '.zip') {
    // Read the zip file
    const zipContents = fs.readFileSync(absolutePath);
    const zipFile = await openZip(zipContents);
    const entries = getEntries(zipFile);

    // Find and read election.json from the zip
    const electionEntry = getFileByName(entries, 'election.json', path);
    electionData = await readTextEntry(electionEntry);

    // Extract election.json to a stable directory for use by other scripts
    if (!fs.existsSync(DEV_DOCK_DIR)) {
      fs.mkdirSync(DEV_DOCK_DIR, { recursive: true });
    }
    fs.writeFileSync(DEV_DOCK_ELECTION_PATH, electionData, 'utf-8');
    resolvedPath = DEV_DOCK_ELECTION_PATH;
  } else {
    // Read directly as JSON file
    electionData = fs.readFileSync(absolutePath, 'utf-8');
    resolvedPath = absolutePath;
  }

  const electionDefinition =
    safeParseElectionDefinition(electionData).unsafeUnwrap();
  const electionInfo: DevDockElectionInfo = {
    path,
    title: electionDefinition.election.title,
    resolvedPath,
  };

  writeDevDockFileContents(devDockFilePath, {
    electionInfo,
  });
}

function getElection(devDockFilePath: string): Optional<DevDockElectionInfo> {
  return readDevDockFileContents(devDockFilePath).electionInfo;
}

function buildApi(devDockFilePath: string, mockSpec: MockSpec) {
  const usbHandler = getMockFileUsbDriveHandler();
  const printerHandler = getMockFilePrinterHandler();
  const fujitsuPrinterHandler = getMockFileFujitsuPrinterHandler();

  return grout.createApi({
    getMockSpec(): SerializableMockSpec {
      return {
        ...mockSpec,
        mockPdiScanner: Boolean(mockSpec.mockPdiScanner),
      };
    },

    async setElection(input: { path: string }): Promise<void> {
      await setElection(input.path, devDockFilePath);
    },

    getElection(): Optional<DevDockElectionInfo> {
      return getElection(devDockFilePath);
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
          const electionGeneratedFile = filesInDir.find((file) =>
            /^electionGenerated.*\.json$/.test(file)
          );
          if (electionGeneratedFile) {
            return {
              path: join(baseFixturePath, item.name, electionGeneratedFile),
              title: item.name,
            };
          }
          const electionFile = filesInDir.find((file) =>
            /^election\.json$/.test(file)
          );
          if (electionFile) {
            return {
              path: join(baseFixturePath, item.name, 'election.json'),
              title: item.name,
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
      const { electionInfo } = readDevDockFileContents(devDockFilePath);
      assert(electionInfo !== undefined);

      // Use resolvedPath if available (for zip files), otherwise use the original path
      const electionFilePath =
        electionInfo.resolvedPath ?? electionPathToAbsolute(electionInfo.path);

      await execFile(MOCK_CARD_SCRIPT_PATH, [
        '--card-type',
        input.role.replace('_', '-'),
        '--electionDefinition',
        electionFilePath,
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
  devDockFilePath: string = DEV_DOCK_FILE_PATH
): void {
  if (!isFeatureFlagEnabled(BooleanEnvironmentVariableName.ENABLE_DEV_DOCK)) {
    return;
  }

  // Create dev dock file if it doesn't exist so we can always read from it
  if (!fs.existsSync(devDockFilePath)) {
    fs.writeFileSync(devDockFilePath, '{}');
  }

  const api = buildApi(devDockFilePath, mockSpec);

  // Set a default election if one is not already set
  if (!getElection(devDockFilePath)) {
    void setElection(
      'libs/fixtures/data/electionGeneral/election.json',
      devDockFilePath
    );
  }

  const dockRouter = grout.buildRouter(api, express);
  app.use('/dock', dockRouter);
}
