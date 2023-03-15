import { mockOf } from '@votingworks/test-utils';
import tmp from 'tmp';
import { getUsbDrives } from './get_usb_drives';
import {
  FileSystemEntryType,
  listDirectory,
  listDirectoryOnUsbDrive,
  listDirectoryRecursive,
} from './list_directory';

jest.mock('./get_usb_drives');

const getUsbDrivesMock = mockOf(getUsbDrives);

describe('listDirectory', () => {
  test('happy path', async () => {
    const directory = tmp.dirSync();
    tmp.fileSync({ name: 'file-1', dir: directory.name });
    tmp.fileSync({ name: 'file-2', dir: directory.name });
    tmp.dirSync({
      name: 'subdirectory',
      dir: directory.name,
    });

    const listDirectoryResult = await listDirectory(directory.name);
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

  test('throws error on relative path', async () => {
    await expect(listDirectory('./relative')).rejects.toThrow();
  });

  test('returns error on non-existent file', async () => {
    const listDirectoryResult = await listDirectory('/tmp/no-entity');
    expect(listDirectoryResult.isErr()).toBeTruthy();
    expect(listDirectoryResult.err()).toMatchObject({ type: 'no-entity' });
  });

  test('returns error on non-directory', async () => {
    const file = tmp.fileSync();
    const listDirectoryResult = await listDirectory(file.name);
    expect(listDirectoryResult.isErr()).toBeTruthy();
    expect(listDirectoryResult.err()).toMatchObject({ type: 'not-directory' });
  });
});

describe(listDirectoryRecursive, () => {
  test('happy path', async () => {
    const directory = tmp.dirSync();
    tmp.fileSync({ name: 'file-1', dir: directory.name });
    tmp.fileSync({ name: 'file-2', dir: directory.name });
    const subDirectory = tmp.dirSync({
      name: 'subdirectory',
      dir: directory.name,
    });
    tmp.fileSync({ name: 'sub-file-2', dir: subDirectory.name });

    const result = await listDirectoryRecursive(directory.name);
    expect(result.isOk()).toBeTruthy();

    expect(result.ok()).toMatchObject([
      expect.objectContaining({
        name: 'file-1',
        type: FileSystemEntryType.File,
      }),
      expect.objectContaining({
        name: 'file-2',
        type: FileSystemEntryType.File,
      }),
      expect.objectContaining({
        name: 'sub-file-2',
        type: FileSystemEntryType.File,
      }),
      expect.objectContaining({
        name: 'subdirectory',
        type: FileSystemEntryType.Directory,
      }),
    ]);
  });

  test('bubbles up root errors', async () => {
    const result = await listDirectoryRecursive('/tmp/no-entity');
    expect(result.isErr()).toBeTruthy();
    expect(result.err()).toMatchObject({ type: 'no-entity' });
  });
});

describe('listDirectoryOnUsbDrive', () => {
  test('happy path', async () => {
    const mockMountPoint = tmp.dirSync();
    getUsbDrivesMock.mockResolvedValueOnce([
      { deviceName: 'mock', mountPoint: mockMountPoint.name },
    ]);

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

    const listDirectoryResult = await listDirectoryOnUsbDrive('./directory');
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
    getUsbDrivesMock.mockResolvedValueOnce([]);
    const listDirectoryResult = await listDirectoryOnUsbDrive('./directory');
    expect(listDirectoryResult.isErr()).toBeTruthy();
    expect(listDirectoryResult.err()).toMatchObject({ type: 'no-usb-drive' });
  });

  test('error on unmounted usb drive', async () => {
    getUsbDrivesMock.mockResolvedValueOnce([{ deviceName: 'mock' }]);
    const listDirectoryResult = await listDirectoryOnUsbDrive('./directory');
    expect(listDirectoryResult.isErr()).toBeTruthy();
    expect(listDirectoryResult.err()).toMatchObject({
      type: 'usb-drive-not-mounted',
    });
  });

  test('can inject a different getUsbDrive for testing', async () => {
    const mockMountPoint = tmp.dirSync();
    const directory = tmp.dirSync({
      name: 'directory',
      dir: mockMountPoint.name,
    });
    tmp.fileSync({ name: 'mock-file-1', dir: directory.name });

    const injectedGetUsbDrive = jest
      .fn()
      .mockResolvedValueOnce([
        { deviceName: 'mock', mountPoint: mockMountPoint.name },
      ]);

    const result = await listDirectoryOnUsbDrive(
      './directory',
      injectedGetUsbDrive
    );
    expect(result.ok()).toMatchObject([
      expect.objectContaining({
        name: 'mock-file-1',
      }),
    ]);
  });
});
