import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils';
import { err, ok, UserSession } from '@votingworks/types';
import { usbstick } from '@votingworks/utils';
import React from 'react';
import { mocked } from 'ts-jest/utils';
import { MachineConfig } from '../config/types';
import { AppContext } from '../contexts/app_context';
import { download, DownloadErrorKind } from '../utils/download';
import { ExportBackupModal } from './export_backup_modal';

jest.mock('../utils/download');

const { UsbDriveStatus } = usbstick;

const machineConfig: MachineConfig = {
  machineId: '0003',
  codeVersion: 'TEST',
};
const currentUserSession: UserSession = { type: 'admin', authenticated: true };

test('renders loading screen when USB drive is mounting or ejecting in export modal', () => {
  const usbStatuses = [UsbDriveStatus.present, UsbDriveStatus.ejecting];

  for (const status of usbStatuses) {
    const closeFn = jest.fn();
    const { unmount } = render(
      <AppContext.Provider
        value={{
          electionDefinition: electionSampleDefinition,
          machineConfig,
          currentUserSession,
        }}
      >
        <ExportBackupModal
          onClose={closeFn}
          usbDrive={{ status, eject: jest.fn() }}
        />
      </AppContext.Provider>
    );
    screen.getByText('Loading');
    unmount();
  }
});

test('render no USB found screen when there is not a mounted USB drive', () => {
  const usbStatuses = [
    UsbDriveStatus.absent,
    UsbDriveStatus.notavailable,
    UsbDriveStatus.recentlyEjected,
  ];

  for (const status of usbStatuses) {
    const closeFn = jest.fn();
    const { unmount } = render(
      <AppContext.Provider
        value={{
          electionDefinition: electionSampleDefinition,
          machineConfig,
          currentUserSession,
        }}
      >
        <ExportBackupModal
          onClose={closeFn}
          usbDrive={{ status, eject: jest.fn() }}
        />
      </AppContext.Provider>
    );
    screen.getByText('No USB Drive Detected');
    screen.getByText('Please insert a USB drive to export the backup.');
    screen.getByAltText('Insert USB Image');

    fireEvent.click(screen.getByText('Cancel'));
    expect(closeFn).toHaveBeenCalled();

    unmount();
  }
});

test('render export modal when a USB drive is mounted as expected and allows custom export', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  mocked(download).mockResolvedValueOnce(ok());

  const closeFn = jest.fn();
  const { rerender } = render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        machineConfig,
        currentUserSession,
      }}
    >
      <ExportBackupModal
        onClose={closeFn}
        usbDrive={{ status: UsbDriveStatus.mounted, eject: jest.fn() }}
      />
    </AppContext.Provider>
  );
  screen.getByText('Export Backup');
  screen.getByText(
    /A ZIP file will automatically be saved to the default location on the mounted USB drive./
  );
  screen.getByAltText('Insert USB Image');

  fireEvent.click(screen.getByText('Custom'));
  await waitFor(() => screen.getByText(/Download Complete/));
  expect(download).toHaveBeenCalledWith('/scan/backup');

  fireEvent.click(screen.getByText('Cancel'));
  expect(closeFn).toHaveBeenCalled();
  rerender(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        machineConfig,
        currentUserSession,
      }}
    >
      <ExportBackupModal
        onClose={closeFn}
        usbDrive={{ status: UsbDriveStatus.recentlyEjected, eject: jest.fn() }}
      />
    </AppContext.Provider>
  );
  screen.getByText('USB drive successfully ejected.');
});

test('render export modal when a USB drive is mounted as expected and allows automatic export', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  mocked(download).mockResolvedValueOnce(ok());

  const closeFn = jest.fn();
  const ejectFn = jest.fn();
  render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        machineConfig,
        currentUserSession,
      }}
    >
      <ExportBackupModal
        onClose={closeFn}
        usbDrive={{ status: UsbDriveStatus.mounted, eject: ejectFn }}
      />
    </AppContext.Provider>
  );
  screen.getByText('Export Backup');

  fireEvent.click(screen.getByText('Export'));
  await waitFor(() => screen.getByText(/Download Complete/));
  expect(download).toHaveBeenCalledWith('/scan/backup', {
    into:
      'fake mount point/scanner-backups/franklin-county_general-election_2f6b1553c7',
  });

  fireEvent.click(screen.getByText('Eject USB'));
  expect(ejectFn).toHaveBeenCalled();
  fireEvent.click(screen.getByText('Cancel'));
  expect(closeFn).toHaveBeenCalled();
});

test('handles no USB drives', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  const closeFn = jest.fn();
  const { getByText } = render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        machineConfig,
        currentUserSession,
      }}
    >
      <ExportBackupModal
        onClose={closeFn}
        usbDrive={{ status: UsbDriveStatus.mounted, eject: jest.fn() }}
      />
    </AppContext.Provider>
  );
  getByText('Export Backup');

  mockKiosk.getUsbDrives.mockResolvedValueOnce([]);
  fireEvent.click(getByText('Export'));
  await waitFor(() => getByText(/Download Failed/));
  getByText(/No USB drive found./);

  fireEvent.click(getByText('Close'));
  expect(closeFn).toHaveBeenCalled();
});

test('shows a specific error for file writer failure', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  const closeFn = jest.fn();
  const { getByText } = render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        machineConfig,
        currentUserSession,
      }}
    >
      <ExportBackupModal
        onClose={closeFn}
        usbDrive={{ status: UsbDriveStatus.mounted, eject: jest.fn() }}
      />
    </AppContext.Provider>
  );
  getByText('Export Backup');

  mockKiosk.getUsbDrives.mockResolvedValueOnce([fakeUsbDrive()]);
  mocked(download).mockResolvedValueOnce(
    err({
      kind: DownloadErrorKind.OpenFailed,
      path: 'backup.zip',
      error: new Error('NOPE'),
    })
  );
  fireEvent.click(getByText('Export'));
  await waitFor(() => getByText(/Download Failed/));
  getByText(/Unable to write file to download location: backup.zip/);

  fireEvent.click(getByText('Close'));
  expect(closeFn).toHaveBeenCalled();
});

test('shows a specific error for fetch failure', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  const closeFn = jest.fn();
  render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        machineConfig,
        currentUserSession,
      }}
    >
      <ExportBackupModal
        onClose={closeFn}
        usbDrive={{ status: UsbDriveStatus.mounted, eject: jest.fn() }}
      />
    </AppContext.Provider>
  );
  screen.getByText('Export Backup');

  mockKiosk.getUsbDrives.mockResolvedValueOnce([fakeUsbDrive()]);
  mocked(download).mockResolvedValueOnce(
    err({
      kind: DownloadErrorKind.FetchFailed,
      response: new Response('', { status: 504, statusText: 'Bad Gateway' }),
    })
  );
  fireEvent.click(screen.getByText('Export'));
  await waitFor(() => screen.getByText('Download Failed'));
  screen.getByText('Unable to get backup: FetchFailed (status=Bad Gateway)');

  fireEvent.click(screen.getByText('Close'));
  expect(closeFn).toHaveBeenCalled();
});
