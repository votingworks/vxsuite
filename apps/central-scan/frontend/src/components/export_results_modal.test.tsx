import { Router } from 'react-router-dom';
import { createMemoryHistory } from 'history';
import { err, ok } from '@votingworks/basics';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import userEvent from '@testing-library/user-event';
import { waitFor } from '../../test/react_testing_library';
import { ExportResultsModal } from './export_results_modal';
import {
  renderInAppContext,
  wrapInAppContext,
} from '../../test/render_in_app_context';
import { MockApiClient, createMockApiClient } from '../../test/api';

let mockApiClient: MockApiClient;

beforeEach(() => {
  mockApiClient = createMockApiClient();
});

afterEach(() => {
  mockApiClient.assertComplete();
});

const mockMountedUsbDrive: UsbDriveStatus = {
  status: 'mounted',
  mountPoint: 'mock',
};

test('render no usb found screen when there is not a valid, mounted usb drive', () => {
  const usbDriveStatuses: UsbDriveStatus[] = [
    { status: 'no_drive' },
    { status: 'ejected' },
    { status: 'error', reason: 'bad_format' },
  ];

  for (const usbDriveStatus of usbDriveStatuses) {
    const closeFn = jest.fn();
    const { getByText, unmount, getByAltText } = renderInAppContext(
      <Router history={createMemoryHistory()}>
        <ExportResultsModal onClose={closeFn} />
      </Router>,
      { usbDriveStatus, apiClient: mockApiClient }
    );
    getByText('No USB Drive Detected');
    getByText('Please insert a USB drive in order to save CVRs.');
    getByAltText('Insert USB Image');

    userEvent.click(getByText('Cancel'));
    expect(closeFn).toHaveBeenCalled();

    unmount();
  }
});

test('render export modal when a usb drive is mounted as expected and allows automatic export', async () => {
  const closeFn = jest.fn();
  const history = createMemoryHistory();
  const { getByText, rerender } = renderInAppContext(
    <ExportResultsModal onClose={closeFn} />,
    {
      usbDriveStatus: mockMountedUsbDrive,
      history,
      apiClient: mockApiClient,
    }
  );
  getByText('Save CVRs');

  mockApiClient.exportCastVoteRecordsToUsbDrive
    .expectCallWith({ isMinimalExport: true })
    .resolves(ok());
  userEvent.click(getByText('Save'));
  await waitFor(() => getByText('CVRs Saved'));

  getByText('Eject USB');
  userEvent.click(getByText('Cancel'));
  expect(closeFn).toHaveBeenCalled();

  rerender(
    wrapInAppContext(<ExportResultsModal onClose={closeFn} />, {
      history,
      usbDriveStatus: { status: 'ejected' },
      apiClient: mockApiClient,
    })
  );
  getByText('You may now take the USB drive to VxAdmin for tabulation.');
});

test('render export modal with errors when appropriate', async () => {
  const closeFn = jest.fn();
  const { getByText } = renderInAppContext(
    <Router history={createMemoryHistory()}>
      <ExportResultsModal onClose={closeFn} />
    </Router>,
    { usbDriveStatus: mockMountedUsbDrive, apiClient: mockApiClient }
  );
  getByText('Save CVRs');

  mockApiClient.exportCastVoteRecordsToUsbDrive
    .expectCallWith({ isMinimalExport: true })
    .resolves(err({ type: 'file-system-error' }));
  userEvent.click(getByText('Save'));
  await waitFor(() =>
    getByText('Failed to save CVRs. Unable to write to USB drive.')
  );

  userEvent.click(getByText('Close'));
  expect(closeFn).toHaveBeenCalled();
});
