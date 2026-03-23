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
import { basename, join } from 'node:path';
import type { MultiUsbDrive, UsbDriveFilesystemType } from '../multi_usb_drive';
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

function getMockUsbDirPath(): string {
  return MOCK_USB_DRIVE_DIR;
}

function getMockDriveDirPath(diskName: string): string {
  return join(getMockUsbDirPath(), diskName);
}

function getMockDriveDataDirPath(diskName: string): string {
  return join(getMockDriveDirPath(diskName), MOCK_USB_DRIVE_DATA_DIRNAME);
}

interface MockDriveState {
  state: 'inserted' | 'ejected' | 'removed';
  fstype?: UsbDriveFilesystemType;
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

function ensureMockDriveState(diskName: string): void {
  const stateFilePath = join(
    getMockDriveDirPath(diskName),
    MOCK_USB_DRIVE_STATE_FILENAME
  );
  if (!existsSync(stateFilePath)) {
    writeMockDriveState(diskName, { state: 'removed' });
  }
}

export function listMockDrives(): string[] {
  const usbRoot = getMockUsbDirPath();
  if (!existsSync(usbRoot)) {
    return [];
  }
  return readdirSync(usbRoot)
    .filter((name) =>
      existsSync(join(usbRoot, name, MOCK_USB_DRIVE_STATE_FILENAME))
    )
    .sort();
}

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

export function removeMockDriveDir(diskName: string): void {
  rmSync(getMockDriveDirPath(diskName), { recursive: true, force: true });
}

export function createMockFileUsbDrive(): UsbDrive {
  const diskName = 'sdb';

  return {
    status(): Promise<UsbDriveStatus> {
      ensureMockDriveState(diskName);
      const { state } = readMockDriveState(diskName);
      if (state === 'removed') {
        return Promise.resolve({ status: 'no_drive' });
      }
      if (state === 'ejected') {
        return Promise.resolve({ status: 'ejected' });
      }
      return Promise.resolve({
        status: 'mounted',
        mountPoint: getMockDriveDataDirPath(diskName),
      });
    },

    eject(): Promise<void> {
      ensureMockDriveState(diskName);
      const { state } = readMockDriveState(diskName);
      if (state === 'inserted') {
        writeMockDriveState(diskName, { state: 'ejected' });
      }
      return Promise.resolve();
    },

    format(): Promise<void> {
      ensureMockDriveState(diskName);
      const { state } = readMockDriveState(diskName);
      if (state === 'inserted') {
        writeMockDriveState(diskName, { state: 'ejected' });
      }
      return Promise.resolve();
    },

    sync(): Promise<void> {
      return Promise.resolve();
    },
  };
}

export class MockFileUsbDrive implements UsbDrive {
  private readonly usbDrive = createMockFileUsbDrive();

  status(): Promise<UsbDriveStatus> {
    return this.usbDrive.status();
  }

  eject(): Promise<void> {
    return this.usbDrive.eject();
  }

  format(): Promise<void> {
    return this.usbDrive.format();
  }

  sync(): Promise<void> {
    return this.usbDrive.sync();
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

export function createMockFileMultiUsbDrive(): MultiUsbDrive {
  return {
    getDrives() {
      return listMockDrives().flatMap((diskName) => {
        const driveState = readMockDriveState(diskName);
        if (driveState.state === 'removed') return [];
        const mount =
          driveState.state === 'inserted'
            ? ({
                type: 'mounted',
                mountPoint: getMockDriveDataDirPath(diskName),
              } as const)
            : ({ type: 'ejected' } as const);
        const isExt4 = driveState.fstype === 'ext4';
        return [
          {
            devPath: `/dev/${diskName}`,
            partitions: [
              {
                devPath: `/dev/${diskName}1`,
                fstype: isExt4 ? 'ext4' : 'vfat',
                fsver: isExt4 ? '1.0' : 'FAT32',
                mount,
              },
            ],
          },
        ];
      });
    },

    refresh: () => Promise.resolve(),

    ejectDrive(driveDevPath: string): Promise<void> {
      const diskName = basename(driveDevPath);
      const { state } = readMockDriveState(diskName);
      if (state === 'inserted') {
        writeMockDriveState(diskName, { state: 'ejected' });
      }
      return Promise.resolve();
    },

    formatDrive(
      driveDevPath: string,
      fstype: UsbDriveFilesystemType
    ): Promise<void> {
      const diskName = basename(driveDevPath);
      const { state } = readMockDriveState(diskName);
      if (state === 'inserted') {
        writeMockDriveState(diskName, { state: 'ejected', fstype });
      }
      return Promise.resolve();
    },

    sync: (partitionDevPath: string) => {
      void partitionDevPath;
      return Promise.resolve();
    },
    stop: () => {},
  };
}

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
