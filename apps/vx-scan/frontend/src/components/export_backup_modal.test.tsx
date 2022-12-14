import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeKiosk, fakeUsbDrive, Inserted } from '@votingworks/test-utils';
import { err, ok } from '@votingworks/types';
import { usbstick } from '@votingworks/utils';
import jestFetchMock from 'jest-fetch-mock';
import React from 'react';
import { createApiMock } from '../../test/helpers/mock_api_client';
import { renderInAppContext } from '../../test/helpers/render_in_app_context';
import { ApiClientContext } from '../api/api';
import {
  ExportBackupModal,
  ExportBackupModalProps,
} from './export_backup_modal';

const { UsbDriveStatus } = usbstick;

const auth = Inserted.fakeElectionManagerAuth();

const apiMock = createApiMock();

beforeEach(() => {
  jestFetchMock.enableMocks();
  apiMock.mockApiClient.reset();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderModal(props: Partial<ExportBackupModalProps> = {}) {
  return renderInAppContext(
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <ExportBackupModal
        onClose={jest.fn()}
        usbDrive={{ status: UsbDriveStatus.present, eject: jest.fn() }}
        {...props}
      />
    </ApiClientContext.Provider>,
    { auth }
  );
}

test('renders loading screen when USB drive is mounting or ejecting in export modal', () => {
  const usbStatuses = [UsbDriveStatus.present, UsbDriveStatus.ejecting];

  for (const status of usbStatuses) {
    const { unmount } = renderModal({
      usbDrive: { status, eject: jest.fn() },
    });
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
    const onClose = jest.fn();
    const { unmount } = renderModal({
      onClose,
      usbDrive: { status, eject: jest.fn() },
    });
    screen.getByText('No USB Drive Detected');
    screen.getByText('Please insert a USB drive to save the backup.');
    screen.getByAltText('Insert USB Image');

    userEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();

    unmount();
  }
});

test('render export modal when a USB drive is mounted as expected and allows automatic export', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);

  const onClose = jest.fn();
  const ejectFn = jest.fn();
  renderModal({
    onClose,
    usbDrive: { status: UsbDriveStatus.mounted, eject: ejectFn },
  });
  screen.getByText('Save Backup');

  apiMock.mockApiClient.backupToUsbDrive.expectCallWith().resolves(ok());
  userEvent.click(screen.getByText('Save'));
  await screen.findByText('Backup Saved');

  userEvent.click(screen.getByText('Eject USB'));
  expect(ejectFn).toHaveBeenCalled();
  userEvent.click(screen.getByText('Cancel'));
  expect(onClose).toHaveBeenCalled();
});

test('handles no USB drives', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  const onClose = jest.fn();
  renderModal({
    onClose,
    usbDrive: { status: UsbDriveStatus.mounted, eject: jest.fn() },
  });
  screen.getByText('Save Backup');

  mockKiosk.getUsbDrives.mockResolvedValueOnce([]);
  userEvent.click(screen.getByText('Save'));
  await screen.findByText('Failed to Save Backup');
  screen.getByText(/No USB drive found./);

  userEvent.click(screen.getByText('Close'));
  expect(onClose).toHaveBeenCalled();
});

test('shows errors from the backend', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  const onClose = jest.fn();
  renderModal({
    onClose,
    usbDrive: { status: UsbDriveStatus.mounted, eject: jest.fn() },
  });
  screen.getByText('Save Backup');

  mockKiosk.getUsbDrives.mockResolvedValueOnce([fakeUsbDrive()]);
  apiMock.mockApiClient.backupToUsbDrive
    .expectCallWith()
    .resolves(err({ type: 'permission-denied', message: 'Permission denied' }));
  userEvent.click(screen.getByText('Save'));
  await screen.findByText('Failed to Save Backup');
  screen.getByText('Permission denied');

  userEvent.click(screen.getByText('Close'));
  expect(onClose).toHaveBeenCalled();
});
