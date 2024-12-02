import { advancePromises, mockKiosk } from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import { err, ok } from '@votingworks/basics';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { screen, waitFor } from '../../test/react_testing_library';
import { SaveBackendFileModal } from './save_backend_file_modal';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

let kiosk = mockKiosk();
let apiMock: ApiMock;

beforeEach(() => {
  kiosk = mockKiosk();
  window.kiosk = kiosk;
  apiMock = createApiMock();
});

afterEach(() => {
  window.kiosk = undefined;
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
    const { unmount } = renderInAppContext(
      <SaveBackendFileModal
        saveFileStatus="idle"
        saveFile={jest.fn()}
        saveFileResult={undefined}
        resetSaveFileResult={jest.fn()}
        onClose={closeFn}
        defaultRelativePath=""
        fileTypeTitle="Batch Export"
        fileType="batch export"
      />,
      {
        usbDriveStatus: mockUsbDriveStatus(status),
        apiMock,
      }
    );
    screen.getByText('No USB Drive Detected');

    userEvent.click(screen.getButton('Cancel'));
    expect(closeFn).toHaveBeenCalled();

    unmount();
  }
});

test('happy usb path - save to default location', async () => {
  const saveFile = jest.fn().mockResolvedValue(ok());

  renderInAppContext(
    <SaveBackendFileModal
      saveFileStatus="idle"
      saveFile={saveFile}
      saveFileResult={undefined}
      resetSaveFileResult={jest.fn()}
      onClose={jest.fn()}
      defaultRelativePath="exports/batch-export.csv"
      fileTypeTitle="Batch Export"
      fileType="batch export"
    />,
    {
      usbDriveStatus: mockUsbDriveStatus('mounted'),
    }
  );
  await screen.findByText('Save Batch Export');

  // TODO: remove when USB status comes from backend. currently, allows
  // component to set the usb drive path in useEffect
  await advancePromises();

  userEvent.click(screen.getButton('Save'));
  await waitFor(() => {
    expect(saveFile).toHaveBeenCalledWith({
      path: 'test-mount-point/exports/batch-export.csv',
    });
  });
});

test('renders saving modal when mutation is loading', () => {
  renderInAppContext(
    <SaveBackendFileModal
      saveFileStatus="loading"
      saveFile={jest.fn()}
      saveFileResult={undefined}
      resetSaveFileResult={jest.fn()}
      onClose={jest.fn()}
      defaultRelativePath=""
      fileTypeTitle="Batch Export"
      fileType="batch export"
    />,
    {
      apiMock,
    }
  );
  screen.getByText('Saving Batch Export');
});

test('shows success screen if success and resets mutation on close', async () => {
  const resetSaveFileResult = jest.fn();
  renderInAppContext(
    <SaveBackendFileModal
      saveFileStatus="success"
      saveFile={jest.fn()}
      saveFileResult={ok([])}
      resetSaveFileResult={resetSaveFileResult}
      onClose={jest.fn()}
      defaultRelativePath=""
      fileTypeTitle="Batch Export"
      fileType="batch export"
    />,
    {
      apiMock,
    }
  );
  screen.getByText('Batch Export Saved');
  userEvent.click(screen.getButton('Close'));
  await waitFor(() => {
    expect(resetSaveFileResult).toBeCalled();
  });
});

test('shows error screen if mutation has error status', () => {
  renderInAppContext(
    <SaveBackendFileModal
      saveFileStatus="error"
      saveFile={jest.fn()}
      saveFileResult={undefined}
      resetSaveFileResult={jest.fn()}
      onClose={jest.fn()}
      defaultRelativePath=""
      fileTypeTitle="Batch Export"
      fileType="batch export"
    />,
    {
      apiMock,
    }
  );
  screen.getByText('Batch Export Not Saved');
});

test('shows error screen if saving file failed on backend', () => {
  renderInAppContext(
    <SaveBackendFileModal
      saveFileStatus="success"
      saveFile={jest.fn()}
      saveFileResult={err({ type: 'permission-denied', message: 'any' })}
      resetSaveFileResult={jest.fn()}
      onClose={jest.fn()}
      defaultRelativePath=""
      fileTypeTitle="Batch Export"
      fileType="batch export"
    />,
    {
      apiMock,
    }
  );
  screen.getByText('Batch Export Not Saved');
  screen.getByText('Failed to save batch export. Permission denied.');
});
