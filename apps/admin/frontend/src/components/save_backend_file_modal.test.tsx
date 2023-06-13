import React from 'react';

import { advancePromises, fakeKiosk } from '@votingworks/test-utils';

import userEvent from '@testing-library/user-event';
import { UsbDriveStatus, mockUsbDrive } from '@votingworks/ui';
import { err, ok } from '@votingworks/basics';
import { screen, waitFor } from '../../test/react_testing_library';
import { SaveBackendFileModal } from './save_backend_file_modal';
import { renderInAppContext } from '../../test/render_in_app_context';

// mock a mount point for the usb drive
jest.mock('@votingworks/utils', () => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    usbstick: {
      ...jest.requireActual('@votingworks/utils').usbstick,
      getInfo: () => ({
        mountPoint: '/media/vx/usb-drive',
      }),
    },
  };
});

test('render no usb found screen when there is not a valid mounted usb drive', () => {
  const usbStatuses: UsbDriveStatus[] = ['absent', 'ejected', 'bad_format'];

  for (const status of usbStatuses) {
    const closeFn = jest.fn();
    const { unmount } = renderInAppContext(
      <SaveBackendFileModal
        onSave={jest.fn()}
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
    screen.getByText(
      'Please insert a USB drive where you would like the save the batch export.'
    );
    screen.getByAltText('Insert USB Image');

    userEvent.click(screen.getButton('Cancel'));
    expect(closeFn).toHaveBeenCalled();

    unmount();
  }
});

test('renders loading screen when usb drive is mounting or ejecting in export modal', () => {
  const usbStatuses: UsbDriveStatus[] = ['mounting', 'ejecting'];

  for (const status of usbStatuses) {
    const { unmount } = renderInAppContext(
      <SaveBackendFileModal
        onSave={jest.fn()}
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

test('has development shortcut to export file without USB drive', async () => {
  const mockKiosk = fakeKiosk();
  const mockShowSaveDialog = jest
    .fn()
    .mockResolvedValue({ filePath: '/user/batch-export.csv' });
  mockKiosk.showSaveDialog = mockShowSaveDialog;
  window.kiosk = mockKiosk;

  const originalEnv: NodeJS.ProcessEnv = { ...process.env };
  process.env = {
    ...originalEnv,
    NODE_ENV: 'development',
  };

  const onSave = jest.fn().mockResolvedValue(ok());

  renderInAppContext(
    <SaveBackendFileModal
      onSave={onSave}
      onClose={jest.fn()}
      defaultRelativePath="batch-export.csv"
      fileTypeTitle="Batch Export"
      fileType="batch export"
    />,
    {
      usbDrive: mockUsbDrive('absent'),
    }
  );

  userEvent.click(screen.getButton('Save As…'));
  expect(mockShowSaveDialog).toHaveBeenCalledWith({
    defaultPath: 'batch-export.csv',
  });
  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith('/user/batch-export.csv');
  });
  await screen.findByText('Batch Export Saved');

  process.env = originalEnv;
});

test('happy path - default location', async () => {
  const onSave = jest.fn().mockResolvedValue(ok());

  renderInAppContext(
    <SaveBackendFileModal
      onSave={onSave}
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

  userEvent.click(screen.getButton('Save'));
  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith(
      '/media/vx/usb-drive/exports/batch-export.csv'
    );
  });
  await screen.findByText('Batch Export Saved');
});

test('save as path', async () => {
  const mockKiosk = fakeKiosk();
  const mockShowSaveDialog = jest
    .fn()
    .mockResolvedValue({ filePath: '/media/vx/usb-drive/batch-export.csv' });
  mockKiosk.showSaveDialog = mockShowSaveDialog;
  window.kiosk = mockKiosk;

  const onSave = jest.fn().mockResolvedValue(ok());

  renderInAppContext(
    <SaveBackendFileModal
      onSave={onSave}
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

  userEvent.click(screen.getButton('Save As…'));
  expect(mockShowSaveDialog).toHaveBeenCalledWith({
    defaultPath: '/media/vx/usb-drive/batch-export.csv',
  });
  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith('/media/vx/usb-drive/batch-export.csv');
  });
  await screen.findByText('Batch Export Saved');
});

test('error path', async () => {
  const onSave = jest
    .fn()
    .mockResolvedValue(err({ type: 'permission-denied', message: 'any' }));

  renderInAppContext(
    <SaveBackendFileModal
      onSave={onSave}
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

  userEvent.click(screen.getButton('Save'));
  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith(
      '/media/vx/usb-drive/exports/batch-export.csv'
    );
  });
  await screen.findByText('Batch Export Not Saved');
  screen.getByText('Failed to save batch export. Permission denied.');
});

test('can cancel save dialog', async () => {
  const mockKiosk = fakeKiosk();
  const mockShowSaveDialog = jest.fn().mockResolvedValue({ canceled: true });
  mockKiosk.showSaveDialog = mockShowSaveDialog;
  window.kiosk = mockKiosk;

  const onSave = jest.fn().mockResolvedValue(ok());

  renderInAppContext(
    <SaveBackendFileModal
      onSave={onSave}
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

  userEvent.click(screen.getButton('Save As…'));
  expect(mockShowSaveDialog).toHaveBeenCalledWith({
    defaultPath: '/media/vx/usb-drive/batch-export.csv',
  });

  // because the save dialog is not part of the UI, we cannot wait for its disappearance,
  // but we need to allow the save as button to settle
  await advancePromises();

  expect(onSave).not.toHaveBeenCalled();
  screen.getByText('Save Batch Export');
});
