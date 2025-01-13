import type Express from 'express';
import * as grout from '@votingworks/grout';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { Optional, assert, assertDefined, iter } from '@votingworks/basics';
import {
  asSheet,
  PrinterConfig,
  PrinterStatus,
  safeParse,
  safeParseElectionDefinition,
  safeParseJson,
  UserRole,
} from '@votingworks/types';
import {
  CardStatus,
  readFromMockFile as readFromCardMockFile,
} from '@votingworks/auth';
import {
  isFeatureFlagEnabled,
  BooleanEnvironmentVariableName,
} from '@votingworks/utils';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import {
  getMockFileFujitsuPrinterHandler,
  PrinterStatus as FujitsuPrinterStatus,
} from '@votingworks/fujitsu-thermal-printer';
import { getMockFilePrinterHandler } from '@votingworks/printing';
import { writeFile } from 'node:fs/promises';
import { execFile } from './utils';

export type DevDockUserRole = Exclude<UserRole, 'cardless_voter'>;
export type DevDockUsbDriveStatus = 'inserted' | 'removed';
export interface DevDockElectionInfo {
  title: string;
  path: string;
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

export const DEV_DOCK_FILE_PATH = '/tmp/dev-dock.json';
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
}

interface SerializableMockSpec extends Omit<MockSpec, 'mockPdiScanner'> {
  mockPdiScanner?: boolean;
}

function buildApi(devDockFilePath: string, mockSpec: MockSpec) {
  const usbHandler = getMockFileUsbDriveHandler();
  const printerHandler = getMockFilePrinterHandler();
  const fujitsuPrinterHandler = getMockFileFujitsuPrinterHandler();

  return grout.createApi({
    getMockSpec(): SerializableMockSpec {
      return {
        ...mockSpec,
      };
    },

    setElection(input: { path: string }): void {
      const electionData = fs.readFileSync(
        electionPathToAbsolute(input.path),
        'utf-8'
      );
      const parseResult = safeParseJson(electionData).unsafeUnwrap() as {
        title: string;
      };

      // const parseResult = safeParseElectionDefinition(electionData);
      // assert(parseResult.isOk());
      const electionInfo: DevDockElectionInfo = {
        path: input.path,
        title: parseResult.title,
        // title: parseResult.ok().election.title,
      };

      writeDevDockFileContents(devDockFilePath, {
        electionInfo,
      });
    },

    getElection(): Optional<DevDockElectionInfo> {
      return readDevDockFileContents(devDockFilePath).electionInfo;
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

      await execFile(MOCK_CARD_SCRIPT_PATH, [
        '--card-type',
        input.role.replace('_', '-'),
        '--electionDefinition',
        electionPathToAbsolute(electionInfo.path),
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
      appName,
      screenshot,
    }: {
      appName: string;
      screenshot: Uint8Array;
    }): Promise<string> {
      assert(/^[a-z0-9]+$/i.test(appName));
      const downloadsPath = join(homedir(), 'Downloads');
      const fileName = `Screenshot-${appName}-${new Date().toISOString()}.png`;
      await writeFile(join(downloadsPath, fileName), screenshot);
      return fileName;
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
  if (!api.getElection()) {
    api.setElection({
      path: 'libs/fixtures/data/electionGeneral/election.json',
    });
  }

  const dockRouter = grout.buildRouter(api, express);
  app.use('/dock', dockRouter);
}
