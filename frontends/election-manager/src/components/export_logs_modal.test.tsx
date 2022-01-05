import React from 'react';

import { fireEvent, waitFor } from '@testing-library/react';
import {
  advanceTimersAndPromises,
  fakeKiosk,
  fakeUsbDrive,
} from '@votingworks/test-utils';
import { LogFileType, usbstick } from '@votingworks/utils';

import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { ExportLogsModal } from './export_logs_modal';
import { renderInAppContext } from '../../test/render_in_app_context';

const { UsbDriveStatus } = usbstick;

const fileSystemEntry: KioskBrowser.FileSystemEntry = {
  name: 'file',
  path: 'path',
  type: 1,
  size: 1,
  atime: new Date(),
  ctime: new Date(2021, 0, 1),
  mtime: new Date(),
};

test('renders loading screen when usb drive is mounting or ejecting in export modal', () => {
  const usbStatuses = [UsbDriveStatus.present, UsbDriveStatus.ejecting];

  for (const status of usbStatuses) {
    const closeFn = jest.fn();
    const { getByText, unmount } = renderInAppContext(
      <ExportLogsModal onClose={closeFn} logFileType={LogFileType.Raw} />,
      {
        usbDriveStatus: status,
      }
    );
    getByText('Loading');
    unmount();
  }
});

test('renders no log file found when usb is mounted but no log file on machine', async () => {
  jest.useFakeTimers();
  const closeFn = jest.fn();
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  mockKiosk.getFileSystemEntries.mockResolvedValueOnce([
    { ...fileSystemEntry, name: 'not-the-right-file.log' },
  ]);
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  const logger = new Logger(LogSource.VxAdminFrontend);
  const logSpy = jest.spyOn(logger, 'log').mockResolvedValue();

  const { getByText } = renderInAppContext(
    <ExportLogsModal onClose={closeFn} logFileType={LogFileType.Raw} />,
    {
      usbDriveStatus: UsbDriveStatus.mounted,
      logger,
    }
  );
  getByText('Loading');
  await advanceTimersAndPromises();
  getByText('No Log File Present');
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.ExportLogFileFound,
    'admin',
    expect.objectContaining({ disposition: 'failure' })
  );
});

test('render no usb found screen when there is not a mounted usb drive', async () => {
  const usbStatuses = [
    UsbDriveStatus.absent,
    UsbDriveStatus.notavailable,
    UsbDriveStatus.recentlyEjected,
  ];
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  mockKiosk.getFileSystemEntries.mockResolvedValue([
    { ...fileSystemEntry, name: 'vx-logs.log' },
  ]);

  for (const status of usbStatuses) {
    const closeFn = jest.fn();
    const { getByText, unmount, getByAltText } = renderInAppContext(
      <ExportLogsModal onClose={closeFn} logFileType={LogFileType.Raw} />,
      {
        usbDriveStatus: status,
      }
    );
    getByText('Loading');
    await advanceTimersAndPromises();
    getByText('No USB Drive Detected');
    getByText(
      'Please insert a USB drive where you would like the save the log file.'
    );
    getByAltText('Insert USB Image');

    fireEvent.click(getByText('Cancel'));
    expect(closeFn).toHaveBeenCalled();

    unmount();
  }
});

test('renders save modal when usb is mounted and saves log file on machine', async () => {
  jest.useFakeTimers();
  const closeFn = jest.fn();
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  mockKiosk.getFileSystemEntries.mockResolvedValueOnce([
    { ...fileSystemEntry, name: 'vx-logs.log' },
  ]);
  mockKiosk.readFile.mockResolvedValue('this-is-my-file-content');
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  const logger = new Logger(LogSource.VxAdminFrontend);
  const logSpy = jest.spyOn(logger, 'log').mockResolvedValue();
  const logCdfSpy = jest
    .spyOn(logger, 'buildCDFLog')
    .mockReturnValue('this-is-the-cdf-content');

  const { getByText } = renderInAppContext(
    <ExportLogsModal onClose={closeFn} logFileType={LogFileType.Raw} />,
    {
      usbDriveStatus: UsbDriveStatus.mounted,
      logger,
    }
  );
  getByText('Loading');
  await advanceTimersAndPromises();
  getByText('Save Logs');
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.ExportLogFileFound,
    'admin',
    expect.objectContaining({ disposition: 'success' })
  );

  fireEvent.click(getByText('Save'));
  expect(mockKiosk.readFile).toHaveBeenCalled();
  jest.advanceTimersByTime(2001);
  await waitFor(() => getByText(/Logs Saved/));
  await waitFor(() => {
    expect(mockKiosk.writeFile).toHaveBeenCalledTimes(1);
    expect(mockKiosk.writeFile).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('fake mount point/vx-log'),
      'this-is-my-file-content'
    );
  });
  expect(logCdfSpy).toHaveBeenCalledTimes(0);

  fireEvent.click(getByText('Close'));
  expect(closeFn).toHaveBeenCalled();

  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'admin',
    expect.objectContaining({
      disposition: 'success',
      filename: expect.stringContaining('vx-log'),
      fileType: 'logs',
    })
  );
});

test('renders save modal when usb is mounted and saves cdf log file on machine', async () => {
  jest.useFakeTimers();
  const closeFn = jest.fn();
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  mockKiosk.getFileSystemEntries.mockResolvedValueOnce([
    { ...fileSystemEntry, name: 'vx-logs.log' },
  ]);
  mockKiosk.readFile.mockResolvedValue('this-is-my-raw-file-content');
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  const logger = new Logger(LogSource.VxAdminFrontend);
  const logSpy = jest.spyOn(logger, 'log').mockResolvedValue();
  logger.buildCDFLog = jest.fn().mockReturnValue('this-is-the-cdf-content');

  const { getByText } = renderInAppContext(
    <ExportLogsModal onClose={closeFn} logFileType={LogFileType.Cdf} />,
    {
      usbDriveStatus: UsbDriveStatus.mounted,
      logger,
    }
  );
  getByText('Loading');
  await advanceTimersAndPromises();
  getByText('Save Logs');
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.ExportLogFileFound,
    'admin',
    expect.objectContaining({ disposition: 'success' })
  );

  fireEvent.click(getByText('Save'));
  expect(mockKiosk.readFile).toHaveBeenCalled();
  jest.advanceTimersByTime(2001);
  await waitFor(() => getByText(/Logs Saved/));
  await waitFor(() => {
    expect(mockKiosk.writeFile).toHaveBeenCalledTimes(1);
    expect(mockKiosk.writeFile).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('fake mount point/vx-log'),
      'this-is-the-cdf-content'
    );
  });
  expect(logger.buildCDFLog).toHaveBeenCalledTimes(1);

  fireEvent.click(getByText('Close'));
  expect(closeFn).toHaveBeenCalled();

  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'admin',
    expect.objectContaining({
      disposition: 'success',
      filename: expect.stringContaining('vx-log'),
      fileType: 'logs',
    })
  );
});

test('render export modal with errors when appropriate', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  mockKiosk.getFileSystemEntries.mockResolvedValueOnce([
    { ...fileSystemEntry, name: 'vx-logs.log' },
  ]);
  const logger = new Logger(LogSource.VxAdminFrontend);
  const logSpy = jest.spyOn(logger, 'log').mockResolvedValue();

  mockKiosk.readFile.mockRejectedValueOnce(new Error('this-is-an-error'));

  const closeFn = jest.fn();
  const { getByText } = renderInAppContext(
    <ExportLogsModal onClose={closeFn} logFileType={LogFileType.Raw} />,
    {
      usbDriveStatus: UsbDriveStatus.mounted,
      logger,
    }
  );
  getByText('Loading');
  await advanceTimersAndPromises();
  getByText('Save Logs');

  fireEvent.click(getByText('Save'));
  await waitFor(() => getByText(/Failed to Save Logs/));
  getByText(/Failed to save log file./);
  getByText(/this-is-an-error/);

  fireEvent.click(getByText('Close'));
  expect(closeFn).toHaveBeenCalled();
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'admin',
    expect.objectContaining({
      disposition: 'failure',
      fileType: 'logs',
      message: 'Error saving log file: this-is-an-error',
    })
  );
});
