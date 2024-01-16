/* istanbul ignore file - test util */

import { createMockUsbDrive } from '@votingworks/usb-drive';
import * as fs from 'fs/promises';
import { Stats } from 'fs';
import { mockOf } from '@votingworks/test-utils';
import { execFile } from '../exec';
import { exportLogsToUsb } from './export_logs_to_usb';

jest.mock('fs/promises', () => ({
  ...jest.requireActual('fs/promises'),
  stat: jest.fn().mockRejectedValue(new Error('not mocked yet')),
}));

jest.mock('../exec', (): typeof import('../exec') => ({
  ...jest.requireActual('../exec'),
  execFile: jest.fn(),
}));

const execFileMock = mockOf(execFile);

test('exportLogsToUsb without logs directory', async () => {
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive({});

  expect(
    (
      await exportLogsToUsb({
        usbDrive: mockUsbDrive.usbDrive,
        machineId: 'TEST-MACHINE-ID',
      })
    ).err()
  ).toEqual('no-logs-directory');

  // now we have the filesystem entry, but it's a file not a directory
  const mockStats = new Stats();
  mockStats.isDirectory = jest.fn().mockReturnValue(false);
  mockOf(fs.stat).mockResolvedValue(mockStats);

  expect(
    (
      await exportLogsToUsb({
        usbDrive: mockUsbDrive.usbDrive,
        machineId: 'TEST-MACHINE-ID',
      })
    ).err()
  ).toEqual('no-logs-directory');
});

test('exportLogsToUsb without USB', async () => {
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.removeUsbDrive();

  const mockStats = new Stats();
  mockStats.isDirectory = jest.fn().mockReturnValue(true);
  mockOf(fs.stat).mockResolvedValue(mockStats);

  expect(
    (
      await exportLogsToUsb({
        usbDrive: mockUsbDrive.usbDrive,
        machineId: 'TEST-MACHINE-ID',
      })
    ).err()
  ).toEqual('no-usb-drive');
});

test('exportLogsToUsb with unknown failure', async () => {
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive({});

  const mockStats = new Stats();
  mockStats.isDirectory = jest.fn().mockReturnValue(true);
  mockOf(fs.stat).mockResolvedValueOnce(mockStats);

  execFileMock.mockImplementationOnce(() => {
    throw new Error('boo');
  });

  expect(
    (
      await exportLogsToUsb({
        usbDrive: mockUsbDrive.usbDrive,
        machineId: 'TEST-MACHINE-ID',
      })
    ).err()
  ).toEqual('copy-failed');
});

test('exportLogsToUsb works when all conditions are met', async () => {
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.usbDrive.status.reset();
  mockUsbDrive.usbDrive.status.expectRepeatedCallsWith().resolves({
    status: 'mounted',
    mountPoint: '/media/usb-drive',
  });

  const mockStats = new Stats();
  mockStats.isDirectory = jest.fn().mockReturnValue(true);
  mockOf(fs.stat).mockResolvedValueOnce(mockStats);

  execFileMock.mockResolvedValue({ stdout: '', stderr: '' });

  expect(
    (
      await exportLogsToUsb({
        usbDrive: mockUsbDrive.usbDrive,
        machineId: 'TEST-MACHINE-ID',
      })
    ).isOk()
  ).toBeTruthy();
  expect(mockOf(fs.stat)).toHaveBeenCalledWith('/var/log/votingworks');

  expect(execFileMock).toHaveBeenCalledWith('mkdir', [
    '-p',
    '/media/usb-drive/logs/machine_TEST-MACHINE-ID',
  ]);

  expect(execFileMock).toHaveBeenCalledWith('cp', [
    '-r',
    '/var/log/votingworks',
    expect.stringMatching('^/media/usb-drive/logs/machine_TEST-MACHINE-ID/'),
  ]);
});
