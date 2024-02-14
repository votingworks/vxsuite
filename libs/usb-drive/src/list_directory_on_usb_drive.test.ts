import { FileSystemEntryType } from '@votingworks/fs';
import tmp from 'tmp';
import { listDirectoryOnUsbDrive } from './list_directory_on_usb_drive';
import { createMockUsbDrive } from './mocks/memory_usb_drive';
import { UsbDriveStatus } from './types';

describe('listDirectoryOnUsbDrive', () => {
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

    const listDirectoryResult = await listDirectoryOnUsbDrive(
      usbDrive,
      './directory'
    );
    expect(listDirectoryResult.isOk()).toBeTruthy();

    expect(listDirectoryResult.ok()).toMatchObject([
      expect.objectContaining({
        name: 'file-1',
        type: FileSystemEntryType.File,
      }),
      expect.objectContaining({
        name: 'file-2',
        type: FileSystemEntryType.File,
      }),
      expect.objectContaining({
        name: 'subdirectory',
        type: FileSystemEntryType.Directory,
      }),
    ]);
  });

  test('error on no usb drive', async () => {
    const { usbDrive } = createMockUsbDrive();
    usbDrive.status.expectCallWith().resolves({
      status: 'no_drive',
    });
    const listDirectoryResult = await listDirectoryOnUsbDrive(
      usbDrive,
      './directory'
    );
    expect(listDirectoryResult.isErr()).toBeTruthy();
    expect(listDirectoryResult.err()).toMatchObject({ type: 'no-usb-drive' });
  });

  test('error on unmounted usb drive', async () => {
    const unmountedStatuses: UsbDriveStatus[] = [
      { status: 'ejected' },
      { status: 'error', reason: 'bad_format' },
    ];
    for (const status of unmountedStatuses) {
      const { usbDrive } = createMockUsbDrive();
      usbDrive.status.expectCallWith().resolves(status);
      const listDirectoryResult = await listDirectoryOnUsbDrive(
        usbDrive,
        './directory'
      );
      expect(listDirectoryResult.isErr()).toBeTruthy();
      expect(listDirectoryResult.err()).toMatchObject({
        type: 'usb-drive-not-mounted',
      });
    }
  });
});
