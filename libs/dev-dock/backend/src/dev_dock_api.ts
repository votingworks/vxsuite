import type Express from 'express';
import * as grout from '@votingworks/grout';
import * as fs from 'fs';
import { Optional, assert } from '@votingworks/basics';
import { safeParseElectionDefinition, UserRole } from '@votingworks/types';
import { isAbsolute, join } from 'path';
import {
  CardStatus,
  readFromMockFile as readFromCardMockFile,
} from '@votingworks/auth';
import {
  isFeatureFlagEnabled,
  BooleanEnvironmentVariableName,
} from '@votingworks/utils';
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
const MOCK_USB_SCRIPT_DIRECTORY = join(__dirname, '../../../usb-mocking');
function getUsbDriveStatus(): DevDockUsbDriveStatus {
  return fs.existsSync('/dev/disk/by-id/usb-mock-part1')
    ? 'inserted'
    : 'removed';
}
async function removeUsbDrive(): Promise<void> {
  await execFile('sudo', [join(MOCK_USB_SCRIPT_DIRECTORY, 'remove.sh')]);
}
async function insertUsbDrive(): Promise<void> {
  await execFile('sudo', [join(MOCK_USB_SCRIPT_DIRECTORY, 'insert.sh')]);
}
async function clearUsbDrive(): Promise<void> {
  await execFile('sudo', [
    join(MOCK_USB_SCRIPT_DIRECTORY, 'initialize.sh'),
    '-s',
    '1000', // 1GB
  ]);
}

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

function buildApi(devDockFilePath: string) {
  return grout.createApi({
    setElection(input: { path: string }): void {
      const electionData = fs.readFileSync(
        electionPathToAbsolute(input.path),
        'utf-8'
      );
      const parseResult = safeParseElectionDefinition(electionData);
      assert(parseResult.isOk());
      const electionInfo: DevDockElectionInfo = {
        path: input.path,
        title: parseResult.ok().election.title,
      };

      writeDevDockFileContents(devDockFilePath, {
        electionInfo,
      });
    },

    getElection(): Optional<DevDockElectionInfo> {
      return readDevDockFileContents(devDockFilePath).electionInfo;
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
      return getUsbDriveStatus();
    },

    async insertUsbDrive(): Promise<void> {
      if (getUsbDriveStatus() === 'removed') {
        await insertUsbDrive();
      }
    },

    async removeUsbDrive(): Promise<void> {
      if (getUsbDriveStatus() === 'inserted') {
        await removeUsbDrive();
      }
    },

    async clearUsbDrive(): Promise<void> {
      if (getUsbDriveStatus() === 'inserted') {
        await removeUsbDrive();
        await clearUsbDrive();
        await insertUsbDrive();
      } else {
        await clearUsbDrive();
      }
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

  const api = buildApi(devDockFilePath);

  // Set a default election if one is not already set
  if (!api.getElection()) {
    api.setElection({
      path: 'libs/fixtures/data/electionGeneral/election.json',
    });
  }

  const dockRouter = grout.buildRouter(api, express);
  app.use('/dock', dockRouter);
}
