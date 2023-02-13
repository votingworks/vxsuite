import React from 'react';

import { fireEvent, render, waitFor } from '@testing-library/react';

import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils';
import { UsbDriveStatus } from '@votingworks/shared-frontend';
import { err } from '@votingworks/basics';
import {
  ExportResultsModal,
  ExportResultsModalProps,
} from './export_results_modal';
import { fakeFileWriter } from '../../test/helpers/fake_file_writer';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../test/helpers/mock_api_client';
import { mockUsbDrive } from '../../test/helpers/mock_usb_drive';

let apiMock: ApiMock;

function renderModal(props: Partial<ExportResultsModalProps> = {}) {
  return render(
    provideApi(
      apiMock,
      <ExportResultsModal
        onClose={jest.fn()}
        usbDrive={mockUsbDrive('mounted')}
        {...props}
      />
    )
  );
}

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('renders loading screen when usb drive is mounting or ejecting in export modal', () => {
  const usbStatuses: UsbDriveStatus[] = ['mounting', 'ejecting'];

  for (const status of usbStatuses) {
    const { getByText, unmount } = renderModal({
      usbDrive: mockUsbDrive(status),
    });
    getByText('Loading');
    unmount();
  }
});

test('render no usb found screen when there is not a compatible mounted usb drive', () => {
  const usbStatuses: UsbDriveStatus[] = ['absent', 'ejected', 'bad_format'];

  for (const status of usbStatuses) {
    const closeFn = jest.fn();
    const { getByText, unmount, getByAltText } = renderModal({
      usbDrive: mockUsbDrive(status),
      onClose: closeFn,
    });
    getByText('No USB Drive Detected');
    getByText('Please insert a USB drive in order to save CVRs.');
    getByAltText('Insert USB Image');

    fireEvent.click(getByText('Cancel'));
    expect(closeFn).toHaveBeenCalled();

    unmount();
  }
});

test('render export modal when a usb drive is mounted as expected and allows export', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  mockKiosk.writeFile.mockResolvedValue(
    fakeFileWriter() as unknown as ReturnType<KioskBrowser.Kiosk['writeFile']>
  );
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);

  apiMock.expectExportCastVoteRecordsToUsbDrive();

  const onClose = jest.fn();
  const usbDrive = mockUsbDrive('mounted');
  const { getByText, rerender } = renderModal({
    onClose,
    usbDrive,
  });
  getByText('Save CVRs');

  fireEvent.click(getByText('Save'));
  await waitFor(() => getByText('CVRs Saved to USB Drive'));

  fireEvent.click(getByText('Eject USB'));
  expect(usbDrive.eject).toHaveBeenCalled();
  fireEvent.click(getByText('Cancel'));
  expect(usbDrive.eject).toHaveBeenCalled();

  rerender(
    provideApi(
      apiMock,
      <ExportResultsModal
        onClose={onClose}
        usbDrive={mockUsbDrive('ejected')}
      />
    )
  );
  getByText('USB Drive Ejected');
  getByText('You may now take the USB Drive to VxAdmin for tabulation.');
});

test('render export modal with errors when appropriate', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  apiMock.mockApiClient.exportCastVoteRecordsToUsbDrive
    .expectCallWith()
    .resolves(
      err({ type: 'file-system-error', message: 'Something went wrong.' })
    );

  const onClose = jest.fn();
  const { getByText } = renderModal({ onClose });
  getByText('Save CVRs');

  fireEvent.click(getByText('Save'));
  await waitFor(() => getByText('Failed to save CVRs. Something went wrong.'));

  fireEvent.click(getByText('Close'));
  expect(onClose).toHaveBeenCalled();
});
