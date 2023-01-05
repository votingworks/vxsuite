import {
  fireEvent,
  waitFor,
  getByText as domGetByText,
} from '@testing-library/react';
import React from 'react';
import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils';
import { UsbDriveStatus } from '@votingworks/ui';
import { ElectionConfiguration } from './election_configuration';
import { renderInAppContext } from '../../test/render_in_app_context';

test('shows loading screen when usb is mounting or ejecting', () => {
  const usbStatuses: UsbDriveStatus[] = ['mounting', 'ejecting'];

  for (const status of usbStatuses) {
    const { getByText, unmount } = renderInAppContext(
      <ElectionConfiguration
        acceptManuallyChosenFile={jest.fn()}
        acceptAutomaticallyChosenFile={jest.fn()}
      />,
      { usbDriveStatus: status }
    );
    getByText('Loading');
    unmount();
  }
});

test('shows insert usb screen when no usb is present with manual load button', async () => {
  const usbStatuses: UsbDriveStatus[] = ['absent', 'ejected'];

  for (const status of usbStatuses) {
    const manualUpload = jest.fn();
    const { getByText, unmount, getByAltText, getByTestId } =
      renderInAppContext(
        <ElectionConfiguration
          acceptManuallyChosenFile={manualUpload}
          acceptAutomaticallyChosenFile={jest.fn()}
        />,
        { usbDriveStatus: status }
      );
    getByText('Load Election Configuration');
    getByText('You may load via the following methods:');
    getByText('Insert a USB drive');
    getByText(/Manually select a file to configure:/);
    getByAltText('Insert USB Image');
    getByText('Select File…');

    fireEvent.change(getByTestId('manual-upload-input'), {
      target: { files: [new File(['file'], 'file.zip')] },
    });
    await waitFor(() => expect(manualUpload).toHaveBeenCalledTimes(1));

    unmount();
  }
});

test('reads files from usb when mounted and shows proper display when there are no matching files', async () => {
  const mockKiosk = fakeKiosk();
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
  mockKiosk.getFileSystemEntries = jest.fn().mockResolvedValue([]);
  window.kiosk = mockKiosk;
  const manualUpload = jest.fn();
  const { getByText, getByAltText, getByTestId } = renderInAppContext(
    <ElectionConfiguration
      acceptManuallyChosenFile={manualUpload}
      acceptAutomaticallyChosenFile={jest.fn()}
    />,
    { usbDriveStatus: 'mounted' }
  );

  await waitFor(() => getByText('No Election Ballot Packages Found'));
  getByText(
    /There were no Election Ballot Packages automatically found on the inserted USB drive. /
  );
  getByText('Select File…');
  getByAltText('Insert USB Image');

  fireEvent.change(getByTestId('manual-upload-input'), {
    target: { files: [new File(['file'], 'file.zip')] },
  });
  await waitFor(() => expect(manualUpload).toHaveBeenCalledTimes(1));
});

test('reads files from usb when mounted and shows list of files', async () => {
  const file1 =
    'choctaw-county_2020-general-election_a5753d5776__2020-12-02_09-42-50.zip';
  const file2 =
    'king-county_2020-general-election_a123456789__2020-12-02_09-52-50.zip';
  const file3 = 'invalidfile.zip';
  const mockKiosk = fakeKiosk();
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
  mockKiosk.getFileSystemEntries = jest.fn().mockResolvedValue([
    { name: file1, type: 1 },
    { name: file2, type: 1 },
    { name: file3, type: 1 },
  ]);
  window.kiosk = mockKiosk;
  const automaticUpload = jest.fn();
  const manualUpload = jest.fn();
  const { getByText, getAllByTestId, getByTestId } = renderInAppContext(
    <ElectionConfiguration
      acceptManuallyChosenFile={manualUpload}
      acceptAutomaticallyChosenFile={automaticUpload}
    />,
    { usbDriveStatus: 'mounted' }
  );

  await waitFor(() => getByText('Choose Election Configuration'));

  // Verify there are 2 table rows, the invalidfile.zip should be filtered out, and file2 should be ordered before file1
  const tableRows = getAllByTestId('table-row');
  expect(tableRows).toHaveLength(2);
  domGetByText(tableRows[0], 'king county');
  domGetByText(tableRows[0], '2020 general election');
  domGetByText(tableRows[0], 'a123456789');
  domGetByText(tableRows[0], '12/2/2020, 9:52:50 AM');
  domGetByText(tableRows[0], 'Select');

  domGetByText(tableRows[1], 'choctaw county');
  domGetByText(tableRows[1], '2020 general election');
  domGetByText(tableRows[1], 'a5753d5776');
  domGetByText(tableRows[1], '12/2/2020, 9:42:50 AM');
  domGetByText(tableRows[1], 'Select');

  fireEvent.click(domGetByText(tableRows[1], 'Select'));
  expect(automaticUpload).toHaveBeenCalledTimes(1);
  expect(automaticUpload).toHaveBeenCalledWith({ name: file1, type: 1 });

  fireEvent.click(domGetByText(tableRows[0], 'Select'));
  expect(automaticUpload).toHaveBeenCalledTimes(2);
  expect(automaticUpload).toHaveBeenCalledWith({ name: file2, type: 1 });

  fireEvent.change(getByTestId('manual-upload-input'), {
    target: { files: [new File(['file'], 'file.zip')] },
  });
  await waitFor(() => expect(manualUpload).toHaveBeenCalledTimes(1));
});

test('shows errors that occur when loading in file list screen', async () => {
  const file1 =
    'choctaw-county_2020-general-election_a5753d5776__2020-12-02_09-42-50.zip';
  const mockKiosk = fakeKiosk();
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
  mockKiosk.getFileSystemEntries = jest
    .fn()
    .mockResolvedValue([{ name: file1, type: 1 }]);
  window.kiosk = mockKiosk;
  const { getByText, getAllByTestId, queryAllByText } = renderInAppContext(
    <ElectionConfiguration
      acceptManuallyChosenFile={jest.fn()}
      acceptAutomaticallyChosenFile={jest
        .fn()
        .mockRejectedValueOnce(new Error('FAKE-ERROR'))}
    />,
    { usbDriveStatus: 'mounted' }
  );

  await waitFor(() => getByText('Choose Election Configuration'));

  // Verify there are 2 table rows, the invalidfile.zip should be filtered out, and file2 should be ordered before file1
  const tableRows = getAllByTestId('table-row');
  expect(tableRows).toHaveLength(1);
  expect(queryAllByText('FAKE-ERROR')).toHaveLength(0);
  expect(
    queryAllByText(/An error occurred while loading the election configuration/)
  ).toHaveLength(0);

  fireEvent.click(domGetByText(tableRows[0], 'Select'));
  await waitFor(() => getByText(/FAKE-ERROR/));
  getByText(/An error occurred while loading the election configuration/);
});
