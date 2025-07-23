import { describe, expect, test } from 'vitest';
import { join } from 'node:path';
import * as fs from 'node:fs/promises';
import { FileSystemEntryType } from '@votingworks/fs';
import { err, iter, ok } from '@votingworks/basics';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { listDirectoryOnUsbDrive } from './list_directory_on_usb_drive';
import { createMockUsbDrive } from './mocks/memory_usb_drive';
import { UsbDriveStatus } from './types';

describe('listDirectoryOnUsbDrive', () => {
  test('happy path', async () => {
    const mockMountPoint = makeTemporaryDirectory();
    const { usbDrive } = createMockUsbDrive();
    usbDrive.status.expectCallWith().resolves({
      status: 'mounted',
      mountPoint: mockMountPoint,
    });

    const directory = join(mockMountPoint, 'directory');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(join(directory, 'file-1'), '');
    await fs.writeFile(join(directory, 'file-2'), '');
    await fs.mkdir(join(directory, 'subdirectory'), { recursive: true });

    const listDirectoryResults = listDirectoryOnUsbDrive(
      usbDrive,
      './directory'
    );

    expect(
      (await iter(listDirectoryResults).toArray()).sort((a, b) =>
        a.isOk() && b.isOk()
          ? a.ok().name.localeCompare(b.ok().name)
          : a.isOk()
          ? -1
          : 1
      )
    ).toMatchObject([
      ok(
        expect.objectContaining({
          name: 'file-1',
          type: FileSystemEntryType.File,
        })
      ),
      ok(
        expect.objectContaining({
          name: 'file-2',
          type: FileSystemEntryType.File,
        })
      ),
      ok(
        expect.objectContaining({
          name: 'subdirectory',
          type: FileSystemEntryType.Directory,
        })
      ),
    ]);
  });

  test('error on no usb drive', async () => {
    const { usbDrive } = createMockUsbDrive();
    usbDrive.status.expectCallWith().resolves({
      status: 'no_drive',
    });
    const listDirectoryResults = listDirectoryOnUsbDrive(
      usbDrive,
      './directory'
    );
    expect(await iter(listDirectoryResults).toArray()).toMatchObject([
      err({ type: 'no-usb-drive' }),
    ]);
  });

  test('error on unmounted usb drive', async () => {
    const unmountedStatuses: UsbDriveStatus[] = [
      { status: 'ejected' },
      { status: 'error', reason: 'bad_format' },
    ];
    for (const status of unmountedStatuses) {
      const { usbDrive } = createMockUsbDrive();
      usbDrive.status.expectCallWith().resolves(status);
      const listDirectoryResults = listDirectoryOnUsbDrive(
        usbDrive,
        './directory'
      );
      expect(await iter(listDirectoryResults).toArray()).toMatchObject([
        err({ type: 'usb-drive-not-mounted' }),
      ]);
    }
  });
});
