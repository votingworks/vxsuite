import fs from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import tmp from 'tmp';
import { Buffer } from 'buffer';

import { assert } from '@votingworks/basics';
import { UsbDrive } from './get_usb_drives';

/**
 * An interface for interacting with USB drives. We inject this into the app so
 * that we can easily mock it in tests.
 */
export interface Usb {
  getUsbDrives: () => Promise<UsbDrive[]>;
}

type MockFileTree = MockFile | MockDirectory;
type MockFile = Buffer;
interface MockDirectory {
  [name: string]: MockFileTree;
}

/**
 * An interface for interacting with a mocked USB drive
 */
export interface MockUsb {
  insertUsbDrive(contents: MockFileTree): void;
  removeUsbDrive(): void;
  mock: jest.Mocked<Usb>;
}

function writeMockFileTree(destinationPath: string, tree: MockFileTree): void {
  if (Buffer.isBuffer(tree)) {
    fs.writeFileSync(destinationPath, tree);
  } else {
    if (!fs.existsSync(destinationPath)) fs.mkdirSync(destinationPath);
    for (const [name, child] of Object.entries(tree)) {
      // Sleep 1ms to ensure that each file is created with a distinct timestamp
      execSync('sleep 0.01');
      writeMockFileTree(join(destinationPath, name), child);
    }
  }
}

/**
 * Creates a mock of the Usb interface to USB drives. Simulates inserting and
 * removing a USB containing a tree of files and directories. Uses a temporary
 * directory on the filesystem to simulate the USB drive.
 */
export function createMockUsb(): MockUsb {
  let mockUsbTmpDir: tmp.DirResult | undefined;

  const mock: jest.Mocked<Usb> = {
    getUsbDrives: jest.fn().mockImplementation(() => {
      if (mockUsbTmpDir) {
        return Promise.resolve([
          {
            deviceName: 'mock-usb-drive',
            mountPoint: mockUsbTmpDir.name,
          },
        ]);
      }
      return Promise.resolve([]);
    }),
  };

  return {
    mock,

    insertUsbDrive(contents: MockFileTree) {
      assert(!mockUsbTmpDir, 'Mock USB drive already inserted');
      mockUsbTmpDir = tmp.dirSync({ unsafeCleanup: true });
      writeMockFileTree(mockUsbTmpDir.name, contents);
    },

    removeUsbDrive() {
      assert(mockUsbTmpDir, 'No mock USB drive to remove');
      mockUsbTmpDir.removeCallback();
      mockUsbTmpDir = undefined;
    },
  };
}
