import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils';
import { err, ok } from '@votingworks/basics';
import { UsbDriveStatus } from '@votingworks/ui';
import { createApiMock, provideApi } from '../../test/helpers/mock_api_client';
import { mockUsbDrive } from '../../test/helpers/mock_usb_drive';
import {
  ExportBackupModal,
  ExportBackupModalProps,
} from './export_backup_modal';

const apiMock = createApiMock();

beforeEach(() => {
  apiMock.mockApiClient.reset();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderModal(props: Partial<ExportBackupModalProps> = {}) {
  return render(
    provideApi(
      apiMock,
      <ExportBackupModal
        onClose={jest.fn()}
        usbDrive={mockUsbDrive('mounting')}
        {...props}
      />
    )
  );
}

test('renders loading screen when USB drive is mounting or ejecting in export modal', () => {
  const usbStatuses: UsbDriveStatus[] = ['mounting', 'ejecting'];

  for (const status of usbStatuses) {
    const { unmount } = renderModal({
      usbDrive: mockUsbDrive(status),
    });
    screen.getByText('Loading');
    unmount();
  }
});

test('render no USB found screen when there is not a compatible mounted USB drive', () => {
  const usbStatuses: UsbDriveStatus[] = ['absent', 'ejected', 'bad_format'];

  for (const status of usbStatuses) {
    const onClose = jest.fn();
    const { unmount } = renderModal({
      onClose,
      usbDrive: mockUsbDrive(status),
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
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);

  const onClose = jest.fn();
  const usbDrive = mockUsbDrive('mounted');
  renderModal({
    onClose,
    usbDrive,
  });
  screen.getByText('Save Backup');

  apiMock.mockApiClient.backupToUsbDrive.expectCallWith().resolves(ok());
  userEvent.click(screen.getByText('Save'));
  await screen.findByText('Backup Saved');

  userEvent.click(screen.getByText('Eject USB'));
  expect(usbDrive.eject).toHaveBeenCalled();
  userEvent.click(screen.getByText('Cancel'));
  expect(onClose).toHaveBeenCalled();
});

test('handles no USB drives', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  const onClose = jest.fn();
  renderModal({
    onClose,
    usbDrive: mockUsbDrive('mounted'),
  });
  screen.getByText('Save Backup');

  mockKiosk.getUsbDriveInfo.mockResolvedValueOnce([]);
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
    usbDrive: mockUsbDrive('mounted'),
  });
  screen.getByText('Save Backup');

  mockKiosk.getUsbDriveInfo.mockResolvedValueOnce([fakeUsbDrive()]);
  apiMock.mockApiClient.backupToUsbDrive
    .expectCallWith()
    .resolves(err({ type: 'permission-denied', message: 'Permission denied' }));
  userEvent.click(screen.getByText('Save'));
  await screen.findByText('Failed to Save Backup');
  screen.getByText('Permission denied');

  userEvent.click(screen.getByText('Close'));
  expect(onClose).toHaveBeenCalled();
});
