import { Buffer } from 'buffer';
import tmp from 'tmp';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { Optional, assert } from '@votingworks/basics';
import { UsbDrive, UsbDriveStatus } from '../usb_drive';
import { MockFileTree, TMP_DIR_PREFIX, writeMockFileTree } from './helpers';

/**
 * The path of the file underlying a MockFileCard
 */
export const MOCK_USB_FILE_PATH = '/tmp/mock-file-usb-drive.json';

interface MockFileContents {
  status: UsbDriveStatus;
  tmpDir?: string;
}

/**
 * Converts a MockFileContents object into a Buffer
 */
function serializeMockFileContents(mockFileContents: MockFileContents): Buffer {
  return Buffer.from(JSON.stringify(mockFileContents), 'utf-8');
}

/**
 * Converts a Buffer created by serializeMockFileContents back into a MockFileContents object
 */
function deserializeMockFileContents(file: Buffer): MockFileContents {
  return JSON.parse(file.toString('utf-8'));
}

function writeToMockFile(mockFileContents: MockFileContents): void {
  writeFileSync(
    MOCK_USB_FILE_PATH,
    serializeMockFileContents(mockFileContents)
  );
}

export function initializeMockFile(): void {
  writeToMockFile({
    status: {
      status: 'no_drive',
    },
  });
}

/**
 * A helper for readFromMockFile. Returns undefined if the mock file doesn't exist or can't be
 * parsed.
 */
function readFromMockFileHelper(): Optional<MockFileContents> {
  if (!existsSync(MOCK_USB_FILE_PATH)) {
    return undefined;
  }
  const file = readFileSync(MOCK_USB_FILE_PATH);
  try {
    return deserializeMockFileContents(file);
  } catch {
    return undefined;
  }
}

/**
 * Reads and parses the contents of the file underlying a MockFileCard
 */
function readFromMockFile(): MockFileContents {
  let mockFileContents = readFromMockFileHelper();
  if (!mockFileContents) {
    initializeMockFile();
    mockFileContents = readFromMockFileHelper();
    assert(mockFileContents !== undefined);
  }
  return mockFileContents;
}

/**
 * USB drive initialized in apps that use a temporary file to mock a real drive.
 */
export class MockFileUsbDrive implements UsbDrive {
  status(): Promise<UsbDriveStatus> {
    return Promise.resolve(readFromMockFile().status);
  }

  eject(): Promise<void> {
    const { status, tmpDir } = readFromMockFile();
    if (status.status === 'mounted') {
      writeToMockFile({ status: { status: 'ejected' }, tmpDir });
    }
    return Promise.resolve();
  }

  format(): Promise<void> {
    return this.eject();
  }
}

interface MockFileUsbDriveHandler {
  insert: (mockFileTree: MockFileTree) => void;
  getMountPoint: () => Optional<string>;
  remove: () => void;
  cleanup: () => void;
}

function insertMockFileUsbDrive(contents: MockFileTree): void {
  const mockUsbTmpDir = tmp.dirSync({
    unsafeCleanup: true,
    prefix: TMP_DIR_PREFIX,
  });
  writeMockFileTree(mockUsbTmpDir.name, contents);
  writeToMockFile({
    status: {
      status: 'mounted',
      mountPoint: mockUsbTmpDir.name,
    },
    tmpDir: mockUsbTmpDir.name,
  });
}

function removeTmpDir(): void {
  const { tmpDir } = readFromMockFile();
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function removeMockFileUsbDrive(): void {
  removeTmpDir();
  writeToMockFile({
    status: {
      status: 'no_drive',
    },
  });
}

function cleanupMockFileUsbDrive(): void {
  removeTmpDir();
  rmSync(MOCK_USB_FILE_PATH);
}

export function getMockFileUsbDriveHandler(): MockFileUsbDriveHandler {
  return {
    insert: insertMockFileUsbDrive,
    getMountPoint: () => readFromMockFile().tmpDir,
    remove: removeMockFileUsbDrive,
    cleanup: cleanupMockFileUsbDrive,
  };
}
