import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Scan } from '@votingworks/api';
import { fakeKiosk, fakeUsbDrive, Inserted } from '@votingworks/test-utils';
import { typedAs, usbstick } from '@votingworks/utils';
import fetchMock from 'fetch-mock';
import jestFetchMock from 'jest-fetch-mock';
import React from 'react';
import { renderInAppContext } from '../../test/helpers/render_in_app_context';
import { ExportBackupModal } from './export_backup_modal';

const { UsbDriveStatus } = usbstick;

const auth = Inserted.fakeElectionManagerAuth();

beforeEach(() => {
  jestFetchMock.enableMocks();
  fetchMock.reset();
  fetchMock.mock();
});

test('renders loading screen when USB drive is mounting or ejecting in export modal', () => {
  const usbStatuses = [UsbDriveStatus.present, UsbDriveStatus.ejecting];

  for (const status of usbStatuses) {
    const closeFn = jest.fn();
    const { unmount } = renderInAppContext(
      <ExportBackupModal
        onClose={closeFn}
        usbDrive={{ status, eject: jest.fn() }}
      />,
      { auth }
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
    const { unmount } = renderInAppContext(
      <ExportBackupModal
        onClose={closeFn}
        usbDrive={{ status, eject: jest.fn() }}
      />,
      { auth }
    );
    screen.getByText('No USB Drive Detected');
    screen.getByText('Please insert a USB drive to save the backup.');
    screen.getByAltText('Insert USB Image');

    fireEvent.click(screen.getByText('Cancel'));
    expect(closeFn).toHaveBeenCalled();

    unmount();
  }
});

test('render export modal when a USB drive is mounted as expected and allows automatic export', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);

  const closeFn = jest.fn();
  const ejectFn = jest.fn();
  renderInAppContext(
    <ExportBackupModal
      onClose={closeFn}
      usbDrive={{ status: UsbDriveStatus.mounted, eject: ejectFn }}
    />,
    { auth }
  );
  screen.getByText('Save Backup');

  fetchMock.postOnce('/precinct-scanner/backup-to-usb-drive', {
    status: 200,
    body: typedAs<Scan.BackupToUsbResponse>({
      status: 'ok',
      paths: ['/media/usb-drive-sdb1/backup.zip'],
    }),
  });
  fireEvent.click(screen.getByText('Save'));
  await screen.findByText('Backup Saved');

  fireEvent.click(screen.getByText('Eject USB'));
  expect(ejectFn).toHaveBeenCalled();
  fireEvent.click(screen.getByText('Cancel'));
  expect(closeFn).toHaveBeenCalled();
});

test('handles no USB drives', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  const closeFn = jest.fn();
  const { getByText } = renderInAppContext(
    <ExportBackupModal
      onClose={closeFn}
      usbDrive={{ status: UsbDriveStatus.mounted, eject: jest.fn() }}
    />,
    { auth }
  );
  getByText('Save Backup');

  mockKiosk.getUsbDrives.mockResolvedValueOnce([]);
  fireEvent.click(getByText('Save'));
  await waitFor(() => getByText('Failed to Save Backup'));
  getByText(/No USB drive found./);

  fireEvent.click(getByText('Close'));
  expect(closeFn).toHaveBeenCalled();
});

test('shows errors from the backend', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  const closeFn = jest.fn();
  renderInAppContext(
    <ExportBackupModal
      onClose={closeFn}
      usbDrive={{ status: UsbDriveStatus.mounted, eject: jest.fn() }}
    />,
    { auth }
  );
  screen.getByText('Save Backup');

  mockKiosk.getUsbDrives.mockResolvedValueOnce([fakeUsbDrive()]);
  fetchMock.postOnce('/precinct-scanner/backup-to-usb-drive', {
    status: 200,
    body: typedAs<Scan.BackupToUsbResponse>({
      status: 'error',
      errors: [{ type: 'permission-denied', message: 'Permission denied' }],
    }),
  });
  fireEvent.click(screen.getByText('Save'));
  await screen.findByText('Failed to Save Backup');
  screen.getByText('Permission denied');

  fireEvent.click(screen.getByText('Close'));
  expect(closeFn).toHaveBeenCalled();
});
