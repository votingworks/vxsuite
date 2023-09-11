/* istanbul ignore file */
import { MockFunction, mockFunction } from '@votingworks/test-utils';
import { execSync } from 'child_process';
import { join } from 'path';
import { mkdirSync, readdirSync, rmSync, writeFileSync, cpSync } from 'fs';
import tmp from 'tmp';
import { Buffer } from 'buffer';
import { UsbDrive } from './usb_drive';

type ActualDirectory = string;
type MockFile = Buffer;
interface MockDirectory {
  [name: string]: MockFileTree;
}
type MockFileTree = MockFile | MockDirectory | ActualDirectory;

function writeMockFileTree(destinationPath: string, tree: MockFileTree): void {
  if (Buffer.isBuffer(tree)) {
    writeFileSync(destinationPath, tree);
  } else if (typeof tree === 'string') {
    cpSync(tree, destinationPath, { recursive: true });
  } else {
    mkdirSync(destinationPath, { recursive: true });
    for (const [name, child] of Object.entries(tree)) {
      // Sleep 1ms to ensure that each file is created with a distinct timestamp
      execSync('sleep 0.01');
      writeMockFileTree(join(destinationPath, name), child);
    }
  }
}

type MockedUsbDrive = {
  [Method in keyof UsbDrive]: MockFunction<UsbDrive[Method]>;
};

/**
 * A mock of the UsbDrive interface. See createMockUsbDrive for details.
 */
export interface MockUsbDrive {
  usbDrive: MockedUsbDrive;
  assertComplete(): void;
  insertUsbDrive(contents: MockFileTree): void;
  removeUsbDrive(): void;
}

const TMP_DIR_PREFIX = 'mock-usb-drive-';

// Clean up any mock USB drives directories that were created during tests
if (typeof jest !== 'undefined') {
  afterAll(() => {
    const tmpDirs = readdirSync('/tmp').filter((name) =>
      name.startsWith(TMP_DIR_PREFIX)
    );
    for (const tmpDir of tmpDirs) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
}

/**
 * Creates a mock of the UsbDrive interface. Each method is mocked with a
 * mockFunction (see @votingworks/test-utils).
 *
 * Also has a insert()/remove() interface to create a fake USB drive backed by a
 * filesystem directory. If using this interface, the mock functions will
 * automatically be updated to return the correct status.
 *
 * Warning: if you use both interfaces, they may get out of sync.
 */
export function createMockUsbDrive(): MockUsbDrive {
  let mockUsbTmpDir: tmp.DirResult | undefined;

  const usbDrive: MockedUsbDrive = {
    status: mockFunction('status'),
    eject: mockFunction('eject'),
    format: mockFunction('format'),
  };

  return {
    usbDrive,

    assertComplete() {
      for (const method of Object.values(usbDrive)) {
        method.assertComplete();
      }
    },

    insertUsbDrive(contents: MockFileTree) {
      mockUsbTmpDir?.removeCallback();
      mockUsbTmpDir = tmp.dirSync({
        unsafeCleanup: true,
        prefix: TMP_DIR_PREFIX,
      });
      writeMockFileTree(mockUsbTmpDir.name, contents);
      usbDrive.status.expectRepeatedCallsWith().resolves({
        status: 'mounted',
        mountPoint: mockUsbTmpDir.name,
        deviceName: 'mock-usb-drive',
      });
    },

    removeUsbDrive() {
      mockUsbTmpDir?.removeCallback();
      mockUsbTmpDir = undefined;
      usbDrive.status
        .expectRepeatedCallsWith()
        .resolves({ status: 'no_drive' });
    },
  };
}
