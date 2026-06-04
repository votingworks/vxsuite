import { makeTemporaryDirectory } from '@votingworks/fixtures';
import assert from 'node:assert';
import { rmSync } from 'node:fs';
import { inspect } from 'node:util';
import { MockFileTree, writeMockFileTree } from './helpers';
import { UsbDrive, UsbDriveStatus } from '../types';

export class MockUsbDriveManager {
  private status: UsbDriveStatus = { status: 'no_drive' };
  private readonly mockUsbDrive: UsbDrive;

  constructor() {
    this.mockUsbDrive = {
      status: () => Promise.resolve(this.status),
      eject: () => {
        this.status = { status: 'ejected' };
        return Promise.resolve();
      },
      format: () => {
        assert(this.status.status === 'mounted');
        this.removeUsbDrive();
        this.insertUsbDrive({});
        return Promise.resolve();
      },
      sync: () => Promise.resolve(),
    };
  }

  get usbDrive(): UsbDrive {
    return this.mockUsbDrive;
  }

  /**
   * Get the mount point path of the drive. Panics if the mock drive is not
   * mounted.
   */
  getMountPoint(): string {
    assert(
      this.status.status === 'mounted',
      `Mock USB drive is not mounted: ${inspect(this.status)}`
    );
    return this.status.mountPoint;
  }

  /**
   * Replaces the contents of the current USB drive and mounts the mock drive.
   */
  insertUsbDrive(contents: MockFileTree): void {
    const mountPoint = makeTemporaryDirectory();
    writeMockFileTree(mountPoint, contents);
    this.status = {
      status: 'mounted',
      mountPoint,
    };
  }

  /**
   * Unmounts & ejects the mock drive, deleting its content.
   */
  removeUsbDrive(): void {
    if (this.status.status === 'mounted') {
      rmSync(this.status.mountPoint, { recursive: true, force: true });
    }
    this.status = { status: 'no_drive' };
  }
}
