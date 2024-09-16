import { FileSystemEntryType } from '@votingworks/fs';
import tmp from 'tmp';
import { err, iter, ok } from '@votingworks/basics';
import { listDirectoryOnUsbDrive } from './list_directory_on_usb_drive';
import { createMockUsbDrive } from './mocks/memory_usb_drive';
import { UsbDriveStatus } from './types';

describe(listDirectoryOnUsbDrive, () => {
  test('happy path', async () => {
    const mockMountPoint = tmp.dirSync();
    const { usbDrive } = createMockUsbDrive();
    usbDrive.status.expectCallWith().resolves({
      status: 'mounted',
      mountPoint: mockMountPoint.name,
    });

    const directory = tmp.dirSync({
      name: 'directory',
      dir: mockMountPoint.name,
    });
    tmp.fileSync({ name: 'file-1', dir: directory.name });
    tmp.fileSync({ name: 'file-2', dir: directory.name });
    tmp.dirSync({
      name: 'subdirectory',
      dir: directory.name,
    });

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
