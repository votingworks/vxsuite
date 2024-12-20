import { vi, beforeEach, afterEach, test, expect } from 'vitest';
import { err } from '@votingworks/basics';

import type { UsbDriveStatus } from '@votingworks/usb-drive';
import userEvent from '@testing-library/user-event';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { render, waitFor } from '../../test/react_testing_library';
import {
  ExportResultsModal,
  ExportResultsModalProps,
} from './export_results_modal';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../test/helpers/mock_api_client';

let apiMock: ApiMock;

function renderModal(props: Partial<ExportResultsModalProps> = {}) {
  return render(
    provideApi(
      apiMock,
      <ExportResultsModal
        onClose={vi.fn()}
        usbDrive={mockUsbDriveStatus('mounted')}
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

test('render no usb found screen when there is not a compatible mounted usb drive', () => {
  const usbStatuses: Array<UsbDriveStatus['status']> = [
    'no_drive',
    'ejected',
    'error',
  ];

  for (const status of usbStatuses) {
    const closeFn = vi.fn();
    const { getByText, unmount } = renderModal({
      usbDrive: mockUsbDriveStatus(status),
      onClose: closeFn,
    });
    getByText('No USB Drive Detected');
    getByText('Insert a USB drive in order to save CVRs.');

    userEvent.click(getByText('Cancel'));
    expect(closeFn).toHaveBeenCalled();

    unmount();
  }
});

test('render export modal when a usb drive is mounted as expected and allows export', async () => {
  const onClose = vi.fn();
  const { getByText, rerender } = renderModal({
    onClose,
    usbDrive: mockUsbDriveStatus('mounted'),
  });
  getByText('Save CVRs');

  apiMock.expectExportCastVoteRecordsToUsbDrive({ mode: 'full_export' });
  userEvent.click(getByText('Save'));
  await waitFor(() => getByText('CVRs Saved'));

  apiMock.mockApiClient.ejectUsbDrive.expectCallWith().resolves();
  userEvent.click(getByText('Eject USB'));
  userEvent.click(getByText('Cancel'));

  rerender(
    provideApi(
      apiMock,
      <ExportResultsModal
        onClose={onClose}
        usbDrive={mockUsbDriveStatus('ejected')}
      />
    )
  );
  getByText('USB Drive Ejected');
  getByText(
    'Insert the USB drive into VxAdmin for adjudication and reporting.'
  );
});

test('render export modal with errors when appropriate', async () => {
  const onClose = vi.fn();
  const { getByText } = renderModal({ onClose });
  getByText('Save CVRs');

  apiMock.mockApiClient.exportCastVoteRecordsToUsbDrive
    .expectCallWith({ mode: 'full_export' })
    .resolves(err({ type: 'file-system-error' }));
  userEvent.click(getByText('Save'));
  await waitFor(() =>
    getByText('Failed to save CVRs. Unable to write to USB drive.')
  );

  userEvent.click(getByText('Close'));
  expect(onClose).toHaveBeenCalled();
});
