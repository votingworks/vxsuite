import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { Optional } from '@votingworks/basics';
import { getMockStateRootDir } from '@votingworks/utils';
import { join } from 'node:path';
import type { MultiUsbDrive } from '../multi_usb_drive';
import { MockFileTree, writeMockFileTree } from './helpers';
import { UsbDrive, UsbDriveStatus } from '../types';

export const MOCK_USB_DRIVE_STATE_FILENAME = 'mock-usb-state.json';
export const MOCK_USB_DRIVE_DATA_DIRNAME = 'mock-usb-data';
// libs/usb-drive/src/mocks/ is 4 levels below the repo root
const REPO_ROOT = join(__dirname, '../../../..');
export const MOCK_USB_DRIVE_DIR = join(
  getMockStateRootDir(REPO_ROOT),
  'usb-drive'
);
export const DEV_MOCK_USB_DRIVE_GLOB_PATTERN = join(MOCK_USB_DRIVE_DIR, '**/*');

const MOCK_USB_DRIVES_SUBDIR = 'usb-drive';

function getMockUsbDirPath(): string {
  return MOCK_USB_DRIVE_DIR;
}

function getMockUsbDrivesRootPath(): string {
  return join(getMockUsbDirPath(), MOCK_USB_DRIVES_SUBDIR);
}

function getMockDriveDirPath(diskName: string): string {
  return join(getMockUsbDrivesRootPath(), diskName);
}

function getMockDriveDataDirPath(diskName: string): string {
  return join(getMockDriveDirPath(diskName), MOCK_USB_DRIVE_DATA_DIRNAME);
}

interface MockDriveState {
  state: 'inserted' | 'ejected' | 'removed';
}

function readMockDriveState(diskName: string): MockDriveState {
  const stateFilePath = join(
    getMockDriveDirPath(diskName),
    MOCK_USB_DRIVE_STATE_FILENAME
  );
  if (!existsSync(stateFilePath)) {
    return { state: 'removed' };
  }
  try {
    return JSON.parse(readFileSync(stateFilePath, 'utf-8')) as MockDriveState;
  } catch {
    return { state: 'removed' };
  }
}

function writeMockDriveState(diskName: string, state: MockDriveState): void {
  const driveDir = getMockDriveDirPath(diskName);
  mkdirSync(driveDir, { recursive: true });
  mkdirSync(getMockDriveDataDirPath(diskName), { recursive: true });
  writeFileSync(
    join(driveDir, MOCK_USB_DRIVE_STATE_FILENAME),
    JSON.stringify(state)
  );
}

/**
 * Lists existing mock drive disk names (e.g. 'sdb', 'sdc'), sorted.
 */
export function listMockDrives(): string[] {
  const usbRoot = getMockUsbDrivesRootPath();
  if (!existsSync(usbRoot)) {
    return [];
  }
  return readdirSync(usbRoot)
    .filter((name) =>
      existsSync(join(usbRoot, name, MOCK_USB_DRIVE_STATE_FILENAME))
    )
    .sort();
}

/**
 * Adds a new mock drive, picking the next available name starting from 'sdb'.
 * Returns the disk name (e.g. 'sdb').
 */
export function addMockDrive(): string {
  const existing = new Set(listMockDrives());
  for (let i = 1; i <= 25; i += 1) {
    const name = `sd${String.fromCharCode('a'.charCodeAt(0) + i)}`;
    if (!existing.has(name)) {
      writeMockDriveState(name, { state: 'removed' });
      return name;
    }
  }
  throw new Error('No available mock drive slot');
}

/**
 * Removes the directory for a mock drive.
 */
export function removeMockDriveDir(diskName: string): void {
  rmSync(getMockDriveDirPath(diskName), { recursive: true, force: true });
}

/**
 * USB drive initialized in apps that use a temporary file to mock a real drive.
 * Always targets the 'sdb' mock drive.
 */
export class MockFileUsbDrive implements UsbDrive {
  private readonly diskName = 'sdb';

  status(): Promise<UsbDriveStatus> {
    const { state } = readMockDriveState(this.diskName);
    if (state === 'removed') {
      return Promise.resolve({ status: 'no_drive' });
    }
    if (state === 'ejected') {
      return Promise.resolve({ status: 'ejected' });
    }
    return Promise.resolve({
      status: 'mounted',
      mountPoint: getMockDriveDataDirPath(this.diskName),
    });
  }

  eject(): Promise<void> {
    const { state } = readMockDriveState(this.diskName);
    if (state === 'inserted') {
      writeMockDriveState(this.diskName, { state: 'ejected' });
    }
    return Promise.resolve();
  }

  // mock not fully implemented
  format(): Promise<void> {
    return this.eject();
  }

  sync(): Promise<void> {
    return Promise.resolve();
  }
}

export interface MockFileUsbDriveHandler {
  status: () => UsbDriveStatus;
  insert: (contents?: MockFileTree) => void;
  remove: () => void;
  clearData: () => void;
  getDataPath: () => Optional<string>;
  cleanup: () => void;
}

/**
 * Creates a MultiUsbDrive implementation backed by per-drive state files.
 * Used by detectOrMockMultiUsbDrive when the USE_MOCK_USB_DRIVE feature flag
 * is set (e.g. in integration tests and dev mode).
 */
export function createMockFileMultiUsbDrive(): MultiUsbDrive {
  return {
    getDrives() {
      return listMockDrives().flatMap((diskName) => {
        const { state } = readMockDriveState(diskName);
        if (state === 'removed') return [];
        const mount =
          state === 'inserted'
            ? ({
                type: 'mounted',
                mountPoint: getMockDriveDataDirPath(diskName),
              } as const)
            : ({ type: 'unmounted' } as const);
        return [
          {
            devPath: `/dev/${diskName}`,
            partitions: [
              {
                devPath: `/dev/${diskName}1`,
                fstype: 'vfat',
                fsver: 'FAT32',
                mount,
              },
            ],
          },
        ];
      });
    },

    refresh: () => Promise.resolve(),

    ejectDrive(driveDevPath: string): Promise<void> {
      const diskName = driveDevPath.slice('/dev/'.length);
      const { state } = readMockDriveState(diskName);
      if (state === 'inserted') {
        writeMockDriveState(diskName, { state: 'ejected' });
      }
      return Promise.resolve();
    },

    formatDrive(driveDevPath: string): Promise<void> {
      const diskName = driveDevPath.slice('/dev/'.length);
      const { state } = readMockDriveState(diskName);
      if (state === 'inserted') {
        writeMockDriveState(diskName, { state: 'ejected' });
      }
      return Promise.resolve();
    },

    sync: () => Promise.resolve(),
    stop: () => {},
  };
}

/**
 * Returns a handler for a specific mock drive, for use in tests and the dev dock.
 * Defaults to 'sdb' for backward compatibility with single-drive usage.
 */
export function getMockFileUsbDriveHandler(
  diskName = 'sdb'
): MockFileUsbDriveHandler {
  function getDataPath(): string {
    return getMockDriveDataDirPath(diskName);
  }

  return {
    status: (): UsbDriveStatus => {
      const { state } = readMockDriveState(diskName);
      if (state === 'removed') return { status: 'no_drive' };
      if (state === 'ejected') return { status: 'ejected' };
      return { status: 'mounted', mountPoint: getDataPath() };
    },
    insert: (contents?: MockFileTree) => {
      if (contents) {
        writeMockFileTree(getDataPath(), contents);
      }
      writeMockDriveState(diskName, { state: 'inserted' });
    },
    remove: () => {
      writeMockDriveState(diskName, { state: 'removed' });
    },
    clearData: () => {
      rmSync(getDataPath(), { recursive: true, force: true });
    },
    getDataPath: () => getDataPath(),
    cleanup: () => {
      rmSync(getMockDriveDirPath(diskName), { recursive: true, force: true });
    },
  };
}
