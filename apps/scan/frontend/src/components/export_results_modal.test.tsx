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
        onClose={jest.fn()}
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
    const closeFn = jest.fn();
    const { getByText, unmount, getByAltText } = renderModal({
      usbDrive: mockUsbDriveStatus(status),
      onClose: closeFn,
    });
    getByText('No USB Drive Detected');
    getByText('Please insert a USB drive in order to save CVRs.');
    getByAltText('Insert USB Image');

    userEvent.click(getByText('Cancel'));
    expect(closeFn).toHaveBeenCalled();

    unmount();
  }
});

test('render export modal when a usb drive is mounted as expected and allows export', async () => {
  const onClose = jest.fn();
  const { getByText, rerender } = renderModal({
    onClose,
    usbDrive: mockUsbDriveStatus('mounted'),
  });
  getByText('Save CVRs');

  apiMock.expectExportCastVoteRecordsToUsbDrive();
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
  getByText('You may now take the USB drive to VxAdmin for tabulation.');
});

test('render export modal with errors when appropriate', async () => {
  const onClose = jest.fn();
  const { getByText } = renderModal({ onClose });
  getByText('Save CVRs');

  apiMock.mockApiClient.exportCastVoteRecordsToUsbDrive
    .expectCallWith()
    .resolves(err({ type: 'file-system-error' }));
  userEvent.click(getByText('Save'));
  await waitFor(() =>
    getByText('Failed to save CVRs. Unable to write to USB drive.')
  );

  userEvent.click(getByText('Close'));
  expect(onClose).toHaveBeenCalled();
});
