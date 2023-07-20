import {
  advancePromises,
  fakeKiosk,
  fakeUsbDrive,
} from '@votingworks/test-utils';
import { UsbDriveStatus, mockUsbDrive } from '@votingworks/ui';
import { err, ok } from '@votingworks/basics';
import { screen, userEvent, waitFor } from '../../test/react_testing_library';
import { SaveBackendFileModal } from './save_backend_file_modal';
import { renderInAppContext } from '../../test/render_in_app_context';

let mockKiosk = fakeKiosk();

beforeEach(() => {
  mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
});

afterEach(() => {
  window.kiosk = undefined;
});

test('render no usb found screen when there is not a valid mounted usb drive', async () => {
  const usbStatuses: UsbDriveStatus[] = ['absent', 'ejected', 'bad_format'];

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
        usbDrive: mockUsbDrive(status),
      }
    );
    screen.getByText('No USB Drive Detected');
    screen.getByAltText('Insert USB Image');

    await userEvent.click(screen.getButton('Cancel'));
    expect(closeFn).toHaveBeenCalled();

    unmount();
  }
});

test('has development shortcut to export file without USB drive', async () => {
  const mockShowSaveDialog = jest
    .fn()
    .mockResolvedValue({ filePath: '/user/batch-export.csv' });
  mockKiosk.showSaveDialog = mockShowSaveDialog;

  const originalEnv: NodeJS.ProcessEnv = { ...process.env };
  process.env = {
    ...originalEnv,
    NODE_ENV: 'development',
  };

  const saveFile = jest.fn().mockResolvedValue(ok());

  renderInAppContext(
    <SaveBackendFileModal
      saveFileStatus="idle"
      saveFile={saveFile}
      saveFileResult={undefined}
      resetSaveFileResult={jest.fn()}
      onClose={jest.fn()}
      defaultRelativePath="batch-export.csv"
      fileTypeTitle="Batch Export"
      fileType="batch export"
    />,
    {
      usbDrive: mockUsbDrive('absent'),
    }
  );

  await userEvent.click(screen.getButton('Save As…'));
  expect(mockShowSaveDialog).toHaveBeenCalledWith({
    defaultPath: 'batch-export.csv',
  });
  await waitFor(() => {
    expect(saveFile).toHaveBeenCalledWith({ path: '/user/batch-export.csv' });
  });

  process.env = originalEnv;
});

test('renders loading screen when usb drive is mounting or ejecting', () => {
  const usbStatuses: UsbDriveStatus[] = ['mounting', 'ejecting'];

  for (const status of usbStatuses) {
    const { unmount } = renderInAppContext(
      <SaveBackendFileModal
        saveFileStatus="idle"
        saveFile={jest.fn()}
        saveFileResult={undefined}
        resetSaveFileResult={jest.fn()}
        onClose={jest.fn()}
        defaultRelativePath=""
        fileTypeTitle="Batch Export"
        fileType="batch export"
      />,
      {
        usbDrive: mockUsbDrive(status),
      }
    );
    screen.getByText('Loading');
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
      usbDrive: mockUsbDrive('mounted'),
    }
  );
  await screen.findByText('Save Batch Export');

  await userEvent.click(screen.getButton('Save'));
  await waitFor(() => {
    expect(saveFile).toHaveBeenCalledWith({
      path: '/media/vx/mock-usb-drive/exports/batch-export.csv',
    });
  });
});

test('happy usb path - save as', async () => {
  const mockShowSaveDialog = jest.fn().mockResolvedValue({
    filePath: '/media/vx/mock-usb-drive/batch-export.csv',
  });
  mockKiosk.showSaveDialog = mockShowSaveDialog;

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
      usbDrive: mockUsbDrive('mounted'),
    }
  );
  await screen.findByText('Save Batch Export');

  await userEvent.click(screen.getButton('Save As…'));
  expect(mockShowSaveDialog).toHaveBeenCalledWith({
    defaultPath: '/media/vx/mock-usb-drive/batch-export.csv',
  });
  await waitFor(() => {
    expect(saveFile).toHaveBeenCalledWith({
      path: '/media/vx/mock-usb-drive/batch-export.csv',
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
    />
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
    />
  );
  screen.getByText('Batch Export Saved');
  await userEvent.click(screen.getButton('Close'));
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
    />
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
    />
  );
  screen.getByText('Batch Export Not Saved');
  screen.getByText('Failed to save batch export. Permission denied.');
});

test('can cancel save dialog', async () => {
  const mockShowSaveDialog = jest.fn().mockResolvedValue({ canceled: true });
  mockKiosk.showSaveDialog = mockShowSaveDialog;

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
      usbDrive: mockUsbDrive('mounted'),
    }
  );
  await screen.findByText('Save Batch Export');

  await userEvent.click(screen.getButton('Save As…'));
  expect(mockShowSaveDialog).toHaveBeenCalledWith({
    defaultPath: '/media/vx/mock-usb-drive/batch-export.csv',
  });

  // because the save dialog is not part of the UI, we cannot wait for its disappearance,
  // but we need to allow the save as button to settle
  await advancePromises();

  expect(saveFile).not.toHaveBeenCalled();
  screen.getByText('Save Batch Export');
});
