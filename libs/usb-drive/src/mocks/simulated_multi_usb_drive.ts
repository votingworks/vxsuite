import { Mocked, mockFunction } from '@votingworks/test-utils';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import {
  MultiUsbDrive,
  UsbDriveFilesystemType,
  UsbDriveInfo,
} from '../multi_usb_drive';
import { MockFileTree, writeMockFileTree } from './helpers';

function runSteps(steps: Iterable<void>): void {
  // eslint-disable-next-line no-underscore-dangle
  for (const _step of steps);
}

export class SimulatedMultiUsbDrive {
  private readonly mockMultiUsbDrive: Mocked<MultiUsbDrive>;
  private readonly mockUsbTmpDirs: string[] = [];
  private readonly drives: UsbDriveInfo[] = [];

  constructor() {
    this.mockMultiUsbDrive = {
      getDrives: mockFunction('getDrives'),
      refresh: mockFunction('refresh'),
      ejectDrive: mockFunction('ejectDrive'),
      formatDrive: mockFunction('formatDrive'),
      sync: mockFunction('sync'),
      stop: mockFunction('stop'),
    };

    this.mockMultiUsbDrive.getDrives
      .expectOptionalRepeatedCallsWith()
      .returns([]);
  }

  get multiUsbDrive(): Mocked<MultiUsbDrive> {
    return this.mockMultiUsbDrive;
  }

  /**
   * Simulates adding a new mounted USB drive alongside whatever is already
   * plugged in. Requires specifying the `devPath` so that it does not conflict
   * with existing drives. Defaults to FAT32.
   */
  addUsbDrive(
    contents: MockFileTree,
    options: { devPath: string; fstype?: UsbDriveFilesystemType }
  ): void {
    runSteps(this.stepwiseAddUsbDrive(contents, options));
  }

  /**
   * Simulates adding a new mounted USB drive alongside whatever is already
   * plugged in. Requires specifying the `devPath` so that it does not conflict
   * with existing drives. Defaults to FAT32.
   */
  *stepwiseAddUsbDrive(
    contents: MockFileTree,
    options: { devPath: string; fstype?: UsbDriveFilesystemType }
  ): Generator<void> {
    const fstype = options.fstype ?? 'fat32';
    const driveInfo: UsbDriveInfo = {
      devPath: options.devPath,
      vendor: undefined,
      model: undefined,
      serial: undefined,
      partitions: [
        {
          devPath: `${options.devPath}1`,
          label: 'VxUSB-ABCDE',
          fstype: fstype === 'ext4' ? 'ext4' : 'vfat',
          fsver: fstype === 'ext4' ? '1.0' : 'FAT32',
          mount: { type: 'unmounted' },
        },
      ],
    };

    this.drives.push(driveInfo);
    this.mockMultiUsbDrive.getDrives.reset();
    this.mockMultiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(this.drives);
    yield;

    for (const partition of driveInfo.partitions) {
      partition.mount = { type: 'mounting' };
      yield;

      const mountPoint = makeTemporaryDirectory();
      this.mockUsbTmpDirs.push(mountPoint);
      writeMockFileTree(mountPoint, contents);
      partition.mount = { type: 'mounted', mountPoint };
      yield;
    }
  }
}
