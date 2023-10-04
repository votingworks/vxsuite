import { Router } from 'react-router-dom';
import { createMemoryHistory } from 'history';

import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils';
import { UsbDriveStatus } from '@votingworks/ui';
import { err, ok } from '@votingworks/basics';
import { fireEvent, waitFor } from '../../test/react_testing_library';
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

test('renders loading screen when usb drive is mounting or ejecting in export modal', () => {
  const usbStatuses: UsbDriveStatus[] = ['mounting', 'ejecting'];

  for (const status of usbStatuses) {
    const closeFn = jest.fn();
    const { getByText, unmount } = renderInAppContext(
      <Router history={createMemoryHistory()}>
        <ExportResultsModal onClose={closeFn} />
      </Router>,
      { usbDriveStatus: status, apiClient: mockApiClient }
    );
    getByText('Loading');
    unmount();
  }
});

test('render no usb found screen when there is not a valid, mounted usb drive', () => {
  const usbStatuses: UsbDriveStatus[] = ['absent', 'ejected', 'bad_format'];

  for (const status of usbStatuses) {
    const closeFn = jest.fn();
    const { getByText, unmount, getByAltText } = renderInAppContext(
      <Router history={createMemoryHistory()}>
        <ExportResultsModal onClose={closeFn} />
      </Router>,
      { usbDriveStatus: status, apiClient: mockApiClient }
    );
    getByText('No USB Drive Detected');
    getByText('Please insert a USB drive in order to save CVRs.');
    getByAltText('Insert USB Image');

    fireEvent.click(getByText('Cancel'));
    expect(closeFn).toHaveBeenCalled();

    unmount();
  }
});

test('render export modal when a usb drive is mounted as expected and allows automatic export', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);

  const closeFn = jest.fn();
  const history = createMemoryHistory();
  const { getByText, rerender } = renderInAppContext(
    <ExportResultsModal onClose={closeFn} />,
    { usbDriveStatus: 'mounted', history, apiClient: mockApiClient }
  );
  getByText('Save CVRs');

  mockApiClient.exportCastVoteRecordsToUsbDrive
    .expectCallWith({ isMinimalExport: true })
    .resolves(ok());
  fireEvent.click(getByText('Save'));
  await waitFor(() => getByText('CVRs Saved'));

  getByText('Eject USB');
  fireEvent.click(getByText('Cancel'));
  expect(closeFn).toHaveBeenCalled();

  rerender(
    wrapInAppContext(<ExportResultsModal onClose={closeFn} />, {
      history,
      usbDriveStatus: 'ejected',
      apiClient: mockApiClient,
    })
  );
  getByText(
    'USB drive successfully ejected, you may now take it to VxAdmin for tabulation.'
  );
});

test('render export modal with errors when appropriate', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  const closeFn = jest.fn();
  const { getByText } = renderInAppContext(
    <Router history={createMemoryHistory()}>
      <ExportResultsModal onClose={closeFn} />
    </Router>,
    { usbDriveStatus: 'mounted', apiClient: mockApiClient }
  );
  getByText('Save CVRs');

  mockApiClient.exportCastVoteRecordsToUsbDrive
    .expectCallWith({ isMinimalExport: true })
    .resolves(err({ type: 'file-system-error', message: 'Uh oh' }));
  fireEvent.click(getByText('Save'));
  await waitFor(() => getByText('Failed to Save CVRs'));
  getByText(/Failed to save CVRs./);
  getByText(/Uh oh/);

  fireEvent.click(getByText('Close'));
  expect(closeFn).toHaveBeenCalled();
});
