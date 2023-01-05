import React from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import {
  fakeKiosk,
  fakeUsbDrive,
  Dipped,
  fakeFileWriter,
} from '@votingworks/test-utils';
import { LogFileType } from '@votingworks/utils';

import { fakeLogger, LogEventId } from '@votingworks/logging';
import userEvent from '@testing-library/user-event';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { ExportLogsButton, ExportLogsButtonRow } from './export_logs_modal';
import { UsbDriveStatus } from './hooks/use_usb_drive';

const machineConfig = {
  codeVersion: 'TEST',
  machineId: '0000',
} as const;

const fileSystemEntry: KioskBrowser.FileSystemEntry = {
  name: 'file',
  path: 'path',
  type: 1,
  size: 1,
  atime: new Date(),
  ctime: new Date(2021, 0, 1),
  mtime: new Date(),
};

test('renders loading screen when usb drive is mounting or ejecting in export modal', async () => {
  const mockKiosk = fakeKiosk();
  mockKiosk.getFileSystemEntries.mockResolvedValue([
    { ...fileSystemEntry, name: 'vx-logs.log' },
  ]);
  window.kiosk = mockKiosk;

  const usbStatuses: UsbDriveStatus[] = ['mounting', 'ejecting'];
  for (const status of usbStatuses) {
    const { unmount } = render(
      <ExportLogsButton
        logFileType={LogFileType.Raw}
        usbDriveStatus={status}
        machineConfig={machineConfig}
        logger={fakeLogger()}
        auth={Dipped.fakeSystemAdministratorAuth()}
      />
    );
    userEvent.click(screen.getByText('Save Log File'));
    await screen.findByText('Loading');
    userEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByRole('alertdialog')).toBeFalsy();
    unmount();
  }
});

test('renders no log file found when usb is mounted but no log file on machine', async () => {
  const mockKiosk = fakeKiosk();
  mockKiosk.getFileSystemEntries.mockResolvedValueOnce([
    { ...fileSystemEntry, name: 'not-the-right-file.log' },
  ]);
  window.kiosk = mockKiosk;

  const logger = fakeLogger();

  render(
    <ExportLogsButton
      logFileType={LogFileType.Raw}
      usbDriveStatus="mounted"
      logger={logger}
      auth={Dipped.fakeElectionManagerAuth()}
      machineConfig={machineConfig}
    />
  );
  userEvent.click(screen.getByText('Save Log File'));
  await screen.findByText('Loading');
  await screen.findByText('No Log File Present');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.SaveLogFileFound,
    'election_manager',
    expect.objectContaining({ disposition: 'failure' })
  );
});

test('render no usb found screen when there is not a mounted usb drive', async () => {
  const mockKiosk = fakeKiosk();
  mockKiosk.getFileSystemEntries.mockResolvedValue([
    { ...fileSystemEntry, name: 'vx-logs.log' },
  ]);
  window.kiosk = mockKiosk;

  const usbStatuses: UsbDriveStatus[] = ['absent', 'ejected'];
  for (const status of usbStatuses) {
    const { unmount } = render(
      <ExportLogsButton
        logFileType={LogFileType.Raw}
        usbDriveStatus={status}
        machineConfig={machineConfig}
        logger={fakeLogger()}
        auth={Dipped.fakeSystemAdministratorAuth()}
      />
    );
    userEvent.click(screen.getByText('Save Log File'));
    await screen.findByText('Loading');
    await screen.findByText('No USB Drive Detected');
    screen.getByText(
      'Please insert a USB drive where you would like the save the log file.'
    );
    screen.getByAltText('Insert USB Image');

    userEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByRole('alertdialog')).toBeFalsy();

    unmount();
  }
});

test('successful save raw log flow', async () => {
  jest.useFakeTimers();
  const mockKiosk = fakeKiosk();
  mockKiosk.getFileSystemEntries.mockResolvedValueOnce([
    { ...fileSystemEntry, name: 'vx-logs.log' },
  ]);
  mockKiosk.readFile.mockResolvedValue('this-is-my-file-content');
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = mockKiosk;

  const logger = fakeLogger();
  const logCdfSpy = jest
    .spyOn(logger, 'buildCDFLog')
    .mockReturnValue('this-is-the-cdf-content');

  render(
    <ExportLogsButton
      logFileType={LogFileType.Raw}
      usbDriveStatus="mounted"
      logger={logger}
      auth={Dipped.fakeElectionManagerAuth()}
      machineConfig={machineConfig}
    />
  );
  userEvent.click(screen.getByText('Save Log File'));
  await screen.findByText('Loading');
  await screen.findByText('Save Logs');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.SaveLogFileFound,
    'election_manager',
    expect.objectContaining({ disposition: 'success' })
  );

  userEvent.click(screen.getByText('Save'));
  await screen.findByText(/Saving Logs/);
  expect(mockKiosk.readFile).toHaveBeenCalled();
  jest.advanceTimersByTime(2001);
  await screen.findByText(/Logs Saved/);
  await waitFor(() => {
    expect(mockKiosk.writeFile).toHaveBeenCalledTimes(1);
    expect(mockKiosk.writeFile).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('fake mount point/vx-log'),
      'this-is-my-file-content'
    );
  });
  expect(logCdfSpy).toHaveBeenCalledTimes(0);

  userEvent.click(screen.getByText('Close'));
  expect(screen.queryByRole('alertdialog')).toBeFalsy();

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    expect.objectContaining({
      disposition: 'success',
      filename: expect.stringContaining('vx-log'),
      fileType: 'logs',
    })
  );
});

test('successful save cdf log file flow', async () => {
  jest.useFakeTimers();
  const mockKiosk = fakeKiosk();
  mockKiosk.getFileSystemEntries.mockResolvedValueOnce([
    { ...fileSystemEntry, name: 'vx-logs.log' },
  ]);
  mockKiosk.readFile.mockResolvedValue('this-is-my-raw-file-content');
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = mockKiosk;

  const logger = fakeLogger();
  logger.buildCDFLog = jest.fn().mockReturnValue('this-is-the-cdf-content');

  render(
    <ExportLogsButton
      logFileType={LogFileType.Cdf}
      usbDriveStatus="mounted"
      logger={logger}
      auth={Dipped.fakeElectionManagerAuth()}
      machineConfig={machineConfig}
      electionDefinition={electionFamousNames2021Fixtures.electionDefinition}
    />
  );
  userEvent.click(screen.getByText('Save CDF Log File'));
  await screen.findByText('Loading');
  await screen.findByText('Save Logs');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.SaveLogFileFound,
    'election_manager',
    expect.objectContaining({ disposition: 'success' })
  );

  userEvent.click(screen.getByText('Save'));
  await screen.findByText(/Saving Logs/);
  expect(mockKiosk.readFile).toHaveBeenCalled();
  jest.advanceTimersByTime(2001);
  await screen.findByText(/Logs Saved/);
  await waitFor(() => {
    expect(mockKiosk.writeFile).toHaveBeenCalledTimes(1);
    expect(mockKiosk.writeFile).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('fake mount point/vx-log'),
      'this-is-the-cdf-content'
    );
  });
  expect(logger.buildCDFLog).toHaveBeenCalledTimes(1);

  userEvent.click(screen.getByText('Close'));
  expect(screen.queryByRole('alertdialog')).toBeFalsy();

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    expect.objectContaining({
      disposition: 'success',
      filename: expect.stringContaining('vx-log'),
      fileType: 'logs',
    })
  );
});

test('failed export flow', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  mockKiosk.getFileSystemEntries.mockResolvedValueOnce([
    { ...fileSystemEntry, name: 'vx-logs.log' },
  ]);
  const logger = fakeLogger();

  mockKiosk.readFile.mockRejectedValueOnce(new Error('this-is-an-error'));

  render(
    <ExportLogsButton
      logFileType={LogFileType.Raw}
      usbDriveStatus="mounted"
      logger={logger}
      auth={Dipped.fakeElectionManagerAuth()}
      machineConfig={machineConfig}
    />
  );
  userEvent.click(screen.getByText('Save Log File'));
  await screen.findByText('Loading');
  await screen.findByText('Save Logs');

  userEvent.click(screen.getByText('Save'));
  await screen.findByText(/Saving Logs/);
  await screen.findByText(/Failed to Save Logs/);
  screen.getByText(/Failed to save log file./);
  screen.getByText(/this-is-an-error/);

  userEvent.click(screen.getByText('Close'));
  expect(screen.queryByRole('alertdialog')).toBeFalsy();
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    expect.objectContaining({
      disposition: 'failure',
      fileType: 'logs',
      message: 'Error saving log file: this-is-an-error',
    })
  );
});

test('successful save to custom location', async () => {
  jest.useFakeTimers();
  const mockKiosk = fakeKiosk();
  mockKiosk.getFileSystemEntries.mockResolvedValueOnce([
    { ...fileSystemEntry, name: 'vx-logs.log' },
  ]);
  mockKiosk.readFile.mockResolvedValue('this-is-my-file-content');
  const fileWriter = fakeFileWriter();
  mockKiosk.saveAs.mockResolvedValueOnce(fileWriter);
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = mockKiosk;

  const logger = fakeLogger();

  render(
    <ExportLogsButton
      logFileType={LogFileType.Raw}
      usbDriveStatus="mounted"
      logger={logger}
      auth={Dipped.fakeElectionManagerAuth()}
      machineConfig={machineConfig}
    />
  );
  userEvent.click(screen.getByText('Save Log File'));
  userEvent.click(await screen.findByText(/Save As/));
  await screen.findByText(/Saving Logs/);
  jest.advanceTimersByTime(2001);
  await screen.findByText(/Logs Saved/);
  await waitFor(() => {
    expect(fileWriter.write).toHaveBeenCalled();
    expect(fileWriter.end).toHaveBeenCalled();
  });

  userEvent.click(screen.getByText('Close'));
  expect(screen.queryByRole('alertdialog')).toBeFalsy();

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    expect.objectContaining({
      disposition: 'success',
      fileType: 'logs',
    })
  );
});

test('failed save to custom location', async () => {
  jest.useFakeTimers();
  const mockKiosk = fakeKiosk();
  mockKiosk.getFileSystemEntries.mockResolvedValueOnce([
    { ...fileSystemEntry, name: 'vx-logs.log' },
  ]);
  mockKiosk.readFile.mockResolvedValue('this-is-my-file-content');
  mockKiosk.saveAs.mockResolvedValueOnce(undefined);
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = mockKiosk;

  const logger = fakeLogger();

  render(
    <ExportLogsButton
      logFileType={LogFileType.Raw}
      usbDriveStatus="mounted"
      logger={logger}
      auth={Dipped.fakeElectionManagerAuth()}
      machineConfig={machineConfig}
    />
  );
  userEvent.click(screen.getByText('Save Log File'));
  userEvent.click(await screen.findByText(/Save As/));
  await screen.findByText(/Saving Logs/);
  jest.advanceTimersByTime(2001);
  await screen.findByText(/Failed to Save Logs/);
  userEvent.click(screen.getByText('Close'));
  expect(screen.queryByRole('alertdialog')).toBeFalsy();

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    expect.objectContaining({
      disposition: 'failure',
      fileType: 'logs',
    })
  );
});

test('button row renders both buttons', () => {
  render(
    <ExportLogsButtonRow
      usbDriveStatus="mounted"
      logger={fakeLogger()}
      auth={Dipped.fakeElectionManagerAuth()}
      machineConfig={machineConfig}
    />
  );

  expect(screen.getByText('Save Log File')).toBeEnabled();

  // without an election definition, CDF button should be disabled
  expect(screen.getByText('Save CDF Log File')).toBeDisabled();
});
