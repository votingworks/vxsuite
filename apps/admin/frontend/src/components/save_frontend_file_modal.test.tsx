import { fakeKiosk } from '@votingworks/test-utils';

import { fakeLogger, LogEventId } from '@votingworks/logging';
import userEvent from '@testing-library/user-event';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { act, fireEvent, waitFor } from '../../test/react_testing_library';
import { SaveFrontendFileModal, FileType } from './save_frontend_file_modal';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

jest.useFakeTimers();

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('render no usb found screen when there is not a valid mounted usb drive', () => {
  const usbStatuses: Array<UsbDriveStatus['status']> = [
    'no_drive',
    'ejected',
    'error',
  ];

  for (const status of usbStatuses) {
    const closeFn = jest.fn();
    const { getByText, unmount, getByAltText } = renderInAppContext(
      <SaveFrontendFileModal
        onClose={closeFn}
        generateFileContent={jest.fn()}
        defaultFilename="file"
        fileType={FileType.TallyReport}
      />,
      {
        usbDriveStatus: mockUsbDriveStatus(status),
        apiMock,
      }
    );
    getByText('No USB Drive Detected');
    getByText(
      'Please insert a USB drive where you would like the save the tally report.'
    );
    getByAltText('Insert USB Image');

    fireEvent.click(getByText('Cancel'));
    expect(closeFn).toHaveBeenCalled();

    unmount();
  }
});

test('renders save screen when usb is mounted with ballot filetype', async () => {
  const closeFn = jest.fn();
  const fileContentFn = jest
    .fn()
    .mockResolvedValueOnce('this-is-my-file-content');
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  const logger = fakeLogger();

  const { getByText, queryAllByText } = renderInAppContext(
    <SaveFrontendFileModal
      onClose={closeFn}
      generateFileContent={fileContentFn}
      defaultFilename="this-is-a-file-name.pdf"
      fileType={FileType.Ballot}
    />,
    {
      usbDriveStatus: mockUsbDriveStatus('mounted'),
      logger,
      apiMock,
    }
  );
  getByText('Save Ballot');
  getByText(/Save the ballot as/);
  getByText('this-is-a-file-name.pdf');

  fireEvent.click(getByText('Save'));
  await waitFor(() => getByText(/Saving Ballot/));
  expect(fileContentFn).toHaveBeenCalled();
  act(() => {
    jest.advanceTimersByTime(2000);
  });
  await waitFor(() => getByText(/Ballot Saved/));
  await waitFor(() => {
    expect(mockKiosk.writeFile).toHaveBeenCalledTimes(1);
    expect(mockKiosk.writeFile).toHaveBeenNthCalledWith(
      1,
      'test-mount-point/this-is-a-file-name.pdf',
      'this-is-my-file-content'
    );
  });

  fireEvent.click(getByText('Close'));
  expect(closeFn).toHaveBeenCalled();

  // Does not show eject usb by default
  expect(queryAllByText('You may now eject the USB drive.')).toHaveLength(0);
  expect(queryAllByText('Eject USB')).toHaveLength(0);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    expect.objectContaining({
      disposition: 'success',
      filename: 'this-is-a-file-name.pdf',
      fileType: FileType.Ballot,
    })
  );
});

test('renders save screen when usb is mounted with results filetype and prompts to eject usb', async () => {
  const closeFn = jest.fn();
  const fileContentFn = jest
    .fn()
    .mockResolvedValueOnce('this-is-my-file-content');
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  const logger = fakeLogger();

  const { getByText } = renderInAppContext(
    <SaveFrontendFileModal
      onClose={closeFn}
      generateFileContent={fileContentFn}
      defaultFilename="this-is-a-file-name.pdf"
      fileType={FileType.Results}
      promptToEjectUsb
    />,
    {
      usbDriveStatus: mockUsbDriveStatus('mounted'),
      logger,
      apiMock,
    }
  );
  getByText('Save Results');
  getByText(/Save the election results as/);
  getByText('this-is-a-file-name.pdf');

  fireEvent.click(getByText('Save'));
  await waitFor(() => getByText(/Saving Results/));
  expect(fileContentFn).toHaveBeenCalled();
  act(() => {
    jest.advanceTimersByTime(2000);
  });
  await waitFor(() => getByText(/Results Saved/));
  getByText(/Election results successfully saved/);
  await waitFor(() => {
    expect(mockKiosk.writeFile).toHaveBeenCalledTimes(1);
    expect(mockKiosk.writeFile).toHaveBeenNthCalledWith(
      1,
      'test-mount-point/this-is-a-file-name.pdf',
      'this-is-my-file-content'
    );
  });

  fireEvent.click(getByText('Close'));
  expect(closeFn).toHaveBeenCalled();
  getByText('You may now eject the USB drive.');
  getByText('Eject USB');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    expect.objectContaining({
      disposition: 'success',
      filename: 'this-is-a-file-name.pdf',
      fileType: FileType.Results,
    })
  );
});

test('render export modal with errors when appropriate', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  const logger = fakeLogger();

  const fileContentFn = jest
    .fn()
    .mockRejectedValueOnce(new Error('this-is-an-error'));

  const closeFn = jest.fn();
  const { getByText } = renderInAppContext(
    <SaveFrontendFileModal
      onClose={closeFn}
      generateFileContent={fileContentFn}
      defaultFilename="this-is-a-file-name.pdf"
      fileType={FileType.TallyReport}
    />,
    {
      usbDriveStatus: mockUsbDriveStatus('mounted'),
      logger,
      apiMock,
    }
  );
  getByText('Save Unofficial Tally Report');

  fireEvent.click(getByText('Save'));
  await waitFor(() => getByText(/Saving Unofficial Tally Report/));
  await waitFor(() => getByText(/Failed to Save Unofficial Tally Report/));
  getByText(/Failed to save tally report./);
  getByText(/this-is-an-error/);

  fireEvent.click(getByText('Close'));
  expect(closeFn).toHaveBeenCalled();
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    expect.objectContaining({
      disposition: 'failure',
      fileType: FileType.TallyReport,
      message: 'Error saving tally report: this-is-an-error',
    })
  );
});

test('creates new directory and saves to it, if specified', async () => {
  const closeFn = jest.fn();
  const fileContentFn = jest.fn().mockResolvedValueOnce('file-content');
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  const { getByText } = renderInAppContext(
    <SaveFrontendFileModal
      onClose={closeFn}
      generateFileContent={fileContentFn}
      defaultFilename="ballot.pdf"
      defaultDirectory="directory"
      fileType={FileType.Ballot}
    />,
    {
      usbDriveStatus: mockUsbDriveStatus('mounted'),
      apiMock,
    }
  );

  userEvent.click(getByText('Save'));
  act(() => {
    jest.advanceTimersByTime(2000);
  });
  await waitFor(() => {
    expect(mockKiosk.makeDirectory).toHaveBeenCalledTimes(1);
    expect(mockKiosk.makeDirectory).toHaveBeenCalledWith(
      'test-mount-point/directory',
      { recursive: true }
    );
    expect(mockKiosk.writeFile).toHaveBeenCalledTimes(1);
    expect(mockKiosk.writeFile).toHaveBeenCalledWith(
      'test-mount-point/directory/ballot.pdf',
      'file-content'
    );
  });
});
