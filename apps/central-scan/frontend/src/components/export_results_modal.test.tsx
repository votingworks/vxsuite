import React from 'react';

import { fireEvent, waitFor } from '@testing-library/react';
import { Router } from 'react-router-dom';
import { createMemoryHistory } from 'history';
import fetchMock from 'fetch-mock';

import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils';
import { UsbDriveStatus } from '@votingworks/ui';
import { typedAs } from '@votingworks/basics';
import { Scan } from '@votingworks/api';
import { ExportResultsModal } from './export_results_modal';
import {
  renderInAppContext,
  wrapInAppContext,
} from '../../test/render_in_app_context';

test('renders loading screen when usb drive is mounting or ejecting in export modal', () => {
  const usbStatuses: UsbDriveStatus[] = ['mounting', 'ejecting'];

  for (const status of usbStatuses) {
    const closeFn = jest.fn();
    const { getByText, unmount } = renderInAppContext(
      <Router history={createMemoryHistory()}>
        <ExportResultsModal onClose={closeFn} numberOfBallots={5} />
      </Router>,
      { usbDriveStatus: status }
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
        <ExportResultsModal onClose={closeFn} numberOfBallots={5} />
      </Router>,
      { usbDriveStatus: status }
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

  fetchMock.postOnce('/central-scanner/scan/export-to-usb-drive', {
    body: typedAs<Scan.ExportToUsbDriveResponse>({
      status: 'ok',
    }),
  });

  const closeFn = jest.fn();
  const history = createMemoryHistory();
  const { getByText, rerender } = renderInAppContext(
    <ExportResultsModal onClose={closeFn} numberOfBallots={5} />,
    { usbDriveStatus: 'mounted', history }
  );
  getByText('Save CVRs');

  fireEvent.click(getByText('Save'));
  await waitFor(() => getByText('CVRs Saved'));
  expect(fetchMock.called('/central-scanner/scan/export-to-usb-drive')).toEqual(
    true
  );

  getByText('Eject USB');
  fireEvent.click(getByText('Cancel'));
  expect(closeFn).toHaveBeenCalled();

  rerender(
    wrapInAppContext(
      <ExportResultsModal onClose={closeFn} numberOfBallots={5} />,
      {
        history,
        usbDriveStatus: 'ejected',
      }
    )
  );
  getByText(
    'USB drive successfully ejected, you may now take it to VxAdmin for tabulation.'
  );
});

test('render export modal with errors when appropriate', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  fetchMock.postOnce('/central-scanner/scan/export-to-usb-drive', {
    body: typedAs<Scan.ExportToUsbDriveResponse>({
      status: 'error',
      errors: [{ type: 'some-error', message: 'something bad happened' }],
    }),
  });

  const closeFn = jest.fn();
  const { getByText } = renderInAppContext(
    <Router history={createMemoryHistory()}>
      <ExportResultsModal onClose={closeFn} numberOfBallots={5} />
    </Router>,
    { usbDriveStatus: 'mounted' }
  );
  getByText('Save CVRs');

  fireEvent.click(getByText('Save'));
  await waitFor(() => getByText('Failed to Save CVRs'));
  getByText(/Failed to save CVRs./);
  getByText(/something bad happened/);

  fireEvent.click(getByText('Close'));
  expect(closeFn).toHaveBeenCalled();
});
