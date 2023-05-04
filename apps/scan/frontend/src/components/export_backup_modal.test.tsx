import React from 'react';
import userEvent from '@testing-library/user-event';
import { err, ok } from '@votingworks/basics';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { render, screen } from '../../test/react_testing_library';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../test/helpers/mock_api_client';
import {
  ExportBackupModal,
  ExportBackupModalProps,
} from './export_backup_modal';
import { fakeUsbDriveStatus } from '../../test/helpers/fake_usb_drive';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
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
        usbDrive={fakeUsbDriveStatus('mounted')}
        {...props}
      />
    )
  );
}

test('render no USB found screen when there is not a compatible mounted USB drive', () => {
  const usbStatuses: Array<UsbDriveStatus['status']> = [
    'no_drive',
    'ejected',
    'error',
  ];

  for (const status of usbStatuses) {
    const onClose = jest.fn();
    const { unmount } = renderModal({
      onClose,
      usbDrive: fakeUsbDriveStatus(status),
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
  const onClose = jest.fn();
  renderModal({
    onClose,
    usbDrive: fakeUsbDriveStatus('mounted'),
  });
  screen.getByText('Save Backup');

  apiMock.mockApiClient.backupToUsbDrive.expectCallWith().resolves(ok());
  userEvent.click(screen.getByText('Save'));
  await screen.findByText('Backup Saved');

  apiMock.mockApiClient.ejectUsbDrive.expectCallWith().resolves();
  userEvent.click(screen.getByText('Eject USB'));
  userEvent.click(screen.getByText('Cancel'));
  expect(onClose).toHaveBeenCalled();
});

test('shows errors from the backend', async () => {
  const onClose = jest.fn();
  renderModal({
    onClose,
    usbDrive: fakeUsbDriveStatus('mounted'),
  });
  screen.getByText('Save Backup');

  apiMock.mockApiClient.backupToUsbDrive
    .expectCallWith()
    .resolves(err({ type: 'permission-denied', message: 'Permission denied' }));
  userEvent.click(screen.getByText('Save'));
  await screen.findByText('Failed to Save Backup');
  screen.getByText('Permission denied');

  userEvent.click(screen.getByText('Close'));
  expect(onClose).toHaveBeenCalled();
});
