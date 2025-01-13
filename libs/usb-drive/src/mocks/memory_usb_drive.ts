import { getTemporaryRootDir } from '@votingworks/fixtures';
import { MockFunction, mockFunction } from '@votingworks/test-utils';
import tmp from 'tmp';
import { MockFileTree, writeMockFileTree } from './helpers';
import { UsbDrive } from '../types';

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

/**
 * Creates a mock of the UsbDrive interface. Each method is mocked with a
 * mockFunction (see @votingworks/test-utils).
 *
 * Also has a insert()/remove() interface to create a mock USB drive backed by a
 * filesystem directory. If using this interface, the mock functions will
 * automatically be updated to return the correct status.
 *
 * Warning: if you use both interfaces, they may get out of sync.
 *
 * Requires that `setupTemporaryRootDir()` from `@votingworks/fixtures` has been
 * called.
 */
export function createMockUsbDrive(): MockUsbDrive {
  let mockUsbTmpDir: tmp.DirResult | undefined;

  const usbDrive: MockedUsbDrive = {
    status: mockFunction('status'),
    eject: mockFunction('eject'),
    format: mockFunction('format'),
    sync: mockFunction('sync'),
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
        tmpdir: getTemporaryRootDir(),
      });
      writeMockFileTree(mockUsbTmpDir.name, contents);
      usbDrive.status.reset();
      usbDrive.status.expectRepeatedCallsWith().resolves({
        status: 'mounted',
        mountPoint: mockUsbTmpDir.name,
      });
    },

    removeUsbDrive() {
      mockUsbTmpDir?.removeCallback();
      mockUsbTmpDir = undefined;
      usbDrive.status.reset();
      usbDrive.status
        .expectRepeatedCallsWith()
        .resolves({ status: 'no_drive' });
    },
  };
}
