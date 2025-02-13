import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { advancePromises, mockKiosk } from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import { err, ok } from '@votingworks/basics';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { screen } from '../../test/react_testing_library';
import { SaveBackendFileModal } from './save_backend_file_modal';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  const kiosk = mockKiosk(vi.fn);
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
    const closeFn = vi.fn();
    const { unmount } = renderInAppContext(
      <SaveBackendFileModal
        saveFileStatus="idle"
        saveFile={vi.fn()}
        saveFileResult={undefined}
        resetSaveFileResult={vi.fn()}
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
  const saveFile = vi.fn().mockResolvedValue(ok());

  renderInAppContext(
    <SaveBackendFileModal
      saveFileStatus="idle"
      saveFile={saveFile}
      saveFileResult={undefined}
      resetSaveFileResult={vi.fn()}
      onClose={vi.fn()}
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
  await vi.waitFor(() => {
    expect(saveFile).toHaveBeenCalledWith({
      path: 'test-mount-point/exports/batch-export.csv',
    });
  });
});

test('renders saving modal when mutation is loading', () => {
  renderInAppContext(
    <SaveBackendFileModal
      saveFileStatus="loading"
      saveFile={vi.fn()}
      saveFileResult={undefined}
      resetSaveFileResult={vi.fn()}
      onClose={vi.fn()}
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
  const resetSaveFileResult = vi.fn();
  renderInAppContext(
    <SaveBackendFileModal
      saveFileStatus="success"
      saveFile={vi.fn()}
      saveFileResult={ok([])}
      resetSaveFileResult={resetSaveFileResult}
      onClose={vi.fn()}
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
  await vi.waitFor(() => {
    expect(resetSaveFileResult).toBeCalled();
  });
});

test('shows error screen if mutation has error status', () => {
  renderInAppContext(
    <SaveBackendFileModal
      saveFileStatus="error"
      saveFile={vi.fn()}
      saveFileResult={undefined}
      resetSaveFileResult={vi.fn()}
      onClose={vi.fn()}
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
      saveFile={vi.fn()}
      saveFileResult={err({ type: 'permission-denied', message: 'any' })}
      resetSaveFileResult={vi.fn()}
      onClose={vi.fn()}
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
