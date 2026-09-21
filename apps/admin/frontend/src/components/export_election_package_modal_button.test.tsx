import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Result, deferred, err, ok } from '@votingworks/basics';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { mockUsbDriveStatus } from '@votingworks/ui';
import {
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { DippedSmartCardAuth } from '@votingworks/types';
import type { ExportDataError } from '@votingworks/admin-backend';
import { screen, within } from '../../test/react_testing_library.js';
import { renderInAppContext } from '../../test/render_in_app_context.js';
import { ExportElectionPackageModalButton } from './export_election_package_modal_button.js';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client.js';

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: new Date(2023, 0, 1),
  });
  apiMock = createApiMock();
});

afterEach(() => {
  vi.useRealTimers();
  apiMock.assertComplete();
});

test('Button renders properly when not clicked', () => {
  renderInAppContext(<ExportElectionPackageModalButton />, {
    apiMock,
  });

  screen.getButton('Save Election Package');
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

test.each<{
  usbStatus: UsbDriveStatus['status'];
}>([
  { usbStatus: 'no_drive' },
  { usbStatus: 'ejected' },
  { usbStatus: 'error' },
])(
  'Modal renders insert usb screen appropriately for status $usbStatus',
  async ({ usbStatus }) => {
    renderInAppContext(<ExportElectionPackageModalButton />, {
      usbDriveStatus: mockUsbDriveStatus(usbStatus),
      apiMock,
    });
    userEvent.click(screen.getButton('Save Election Package'));
    await vi.waitFor(() => screen.getByText('No USB Drive Detected'));
    screen.getByText(
      'Insert a USB drive in order to save the election package.'
    );

    userEvent.click(screen.getButton('Cancel'));
    await vi.waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
  }
);

const GIB = 1024 ** 3;
const FAT32_MAX_FILE_SIZE = 2 ** 32 - 1;

const systemAdministratorAuth: DippedSmartCardAuth.SystemAdministratorLoggedIn =
  {
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  };

test('Modal renders export confirmation screen when usb detected', async () => {
  apiMock.expectGetElectionPackageSize(1024);
  renderInAppContext(<ExportElectionPackageModalButton />, {
    usbDriveStatus: mockUsbDriveStatus('mounted'),
    apiMock,
  });
  userEvent.click(
    await screen.findByRole('button', { name: 'Save Election Package' })
  );
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText('Save Election Package');
  within(modal).getByText(
    /An election package will be saved to the inserted USB drive./
  );

  const { promise, resolve } = deferred<Result<void, ExportDataError>>();
  apiMock.apiClient.saveElectionPackageToUsb.expectCallWith().returns(promise);
  userEvent.click(within(modal).getButton('Save'));
  expect(await within(modal).findButton('Saving...')).toBeDisabled();
  // Clicking outside the modal should not close it while the save is in progress.
  userEvent.click(modal.parentElement!);
  screen.getByRole('alertdialog');
  resolve(ok());
  await within(modal).findByText('Election Package Saved');

  screen.getByText(
    'You may now eject the USB drive. Use the saved election package on the USB drive to configure VxSuite components.'
  );

  apiMock.expectEjectUsbDrive();
  userEvent.click(screen.getButton('Eject USB'));

  userEvent.click(screen.getButton('Close'));
  await vi.waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});

test('Modal renders error message appropriately', async () => {
  apiMock.expectGetElectionPackageSize(1024);
  renderInAppContext(<ExportElectionPackageModalButton />, {
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });
  userEvent.click(screen.getButton('Save Election Package'));
  await screen.findByRole('heading', { name: 'Save Election Package' });

  apiMock.expectSaveElectionPackageToUsb(
    err({ type: 'missing-usb-drive', message: '' })
  );
  userEvent.click(await screen.findButton('Save'));

  await screen.findByRole('heading', {
    name: 'Failed to Save Election Package',
  });
  screen.getByText(/An error occurred: No USB drive detected/);

  userEvent.click(screen.getButton('Close'));
  await vi.waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});

test('Modal waits for the election package size before offering to save', async () => {
  const { promise, resolve } = deferred<number>();
  apiMock.apiClient.getElectionPackageSize.expectCallWith().returns(promise);
  renderInAppContext(<ExportElectionPackageModalButton />, {
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });
  userEvent.click(screen.getButton('Save Election Package'));
  await screen.findByRole('heading', { name: 'Save Election Package' });
  expect(
    screen.queryByRole('button', { name: 'Save' })
  ).not.toBeInTheDocument();
  screen.getButton('Cancel');

  resolve(1024);
  await screen.findButton('Save');
});

test('Modal offers a system administrator formatting when the package exceeds the FAT32 limit', async () => {
  apiMock.expectGetElectionPackageSize(5 * GIB);
  renderInAppContext(<ExportElectionPackageModalButton />, {
    apiMock,
    auth: systemAdministratorAuth,
    usbDriveStatus: mockUsbDriveStatus('mounted', {
      fstype: 'fat32',
      maxFileSize: FAT32_MAX_FILE_SIZE,
      totalBytes: 32 * GIB,
      availableBytes: 32 * GIB,
    }),
  });
  userEvent.click(screen.getButton('Save Election Package'));
  await screen.findByRole('heading', {
    name: 'File Too Large for USB Drive',
  });
  screen.getByText(/The election package is/);
  screen.getByText('5.0 GB');
  screen.getByText(/formatted as/);
  screen.getByText('FAT32');
  screen.getByText(/cannot store files larger than/);
  screen.getByText(/Format the USB drive to continue\./);
  expect(
    screen.queryByRole('button', { name: 'Save' })
  ).not.toBeInTheDocument();

  userEvent.click(screen.getButton('Format USB Drive'));
  await screen.findByRole('heading', { name: 'Format USB Drive' });
  apiMock.expectFormatUsbDrive();
  userEvent.click(screen.getButton('Format USB Drive'));
  await screen.findByRole('heading', { name: 'USB Drive Formatted' });

  userEvent.click(screen.getButton('Close'));
  await screen.findByRole('heading', {
    name: 'File Too Large for USB Drive',
  });
  userEvent.click(screen.getButton('Cancel'));
  await vi.waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});

test('Modal tells an election manager to ask for formatting when the package exceeds the FAT32 limit', async () => {
  apiMock.expectGetElectionPackageSize(5 * GIB);
  renderInAppContext(<ExportElectionPackageModalButton />, {
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted', {
      fstype: 'fat32',
      maxFileSize: FAT32_MAX_FILE_SIZE,
      totalBytes: 32 * GIB,
      availableBytes: 32 * GIB,
    }),
  });
  userEvent.click(screen.getButton('Save Election Package'));
  await screen.findByRole('heading', {
    name: 'File Too Large for USB Drive',
  });
  screen.getByText(/Ask a system administrator to format the USB drive/);
  expect(
    screen.queryByRole('button', { name: 'Format USB Drive' })
  ).not.toBeInTheDocument();
  userEvent.click(screen.getButton('Cancel'));
});

test('Modal explains when the USB drive is too full', async () => {
  apiMock.expectGetElectionPackageSize(5 * GIB);
  renderInAppContext(<ExportElectionPackageModalButton />, {
    apiMock,
    auth: systemAdministratorAuth,
    usbDriveStatus: mockUsbDriveStatus('mounted', {
      totalBytes: 32 * GIB,
      availableBytes: 2 * GIB,
    }),
  });
  userEvent.click(screen.getButton('Save Election Package'));
  await screen.findByRole('heading', {
    name: 'Not Enough Space on USB Drive',
  });
  screen.getByText(/the USB drive only has/);
  screen.getByText('2.0 GB');
  screen.getByText(
    /Remove files from the USB drive or format it to continue\./
  );
  screen.getButton('Format USB Drive');
  userEvent.click(screen.getButton('Cancel'));
});

test('Modal tells an election manager to remove files when the USB drive is too full', async () => {
  apiMock.expectGetElectionPackageSize(5 * GIB);
  renderInAppContext(<ExportElectionPackageModalButton />, {
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted', {
      totalBytes: 32 * GIB,
      availableBytes: 2 * GIB,
    }),
  });
  userEvent.click(screen.getButton('Save Election Package'));
  await screen.findByRole('heading', {
    name: 'Not Enough Space on USB Drive',
  });
  screen.getByText(/Remove files from the USB drive to continue\./);
  expect(
    screen.queryByRole('button', { name: 'Format USB Drive' })
  ).not.toBeInTheDocument();
  userEvent.click(screen.getButton('Cancel'));
});

test('Modal explains when the USB drive is too small to ever fit the package', async () => {
  apiMock.expectGetElectionPackageSize(5 * GIB);
  renderInAppContext(<ExportElectionPackageModalButton />, {
    apiMock,
    auth: systemAdministratorAuth,
    usbDriveStatus: mockUsbDriveStatus('mounted', {
      totalBytes: 4 * GIB,
      availableBytes: 4 * GIB,
    }),
  });
  userEvent.click(screen.getButton('Save Election Package'));
  await screen.findByRole('heading', {
    name: 'USB Drive Too Small',
  });
  screen.getByText(/the USB drive can only hold/);
  screen.getByText('4.0 GB');
  screen.getByText(/Use a larger USB drive\./);
  expect(
    screen.queryByRole('button', { name: 'Format USB Drive' })
  ).not.toBeInTheDocument();
  userEvent.click(screen.getButton('Cancel'));
});

test.each<{ error: ExportDataError; message: string }>([
  {
    error: { type: 'file-too-large', message: '' },
    message: 'File is too large for the USB drive format',
  },
  {
    error: { type: 'insufficient-space', message: '' },
    message: 'Not enough space on the USB drive',
  },
])('Modal renders the $error.type error', async ({ error, message }) => {
  apiMock.expectGetElectionPackageSize(1024);
  renderInAppContext(<ExportElectionPackageModalButton />, {
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });
  userEvent.click(screen.getButton('Save Election Package'));
  apiMock.expectSaveElectionPackageToUsb(err(error));
  userEvent.click(await screen.findButton('Save'));
  await screen.findByRole('heading', {
    name: 'Failed to Save Election Package',
  });
  screen.getByText(`An error occurred: ${message}.`);
});
