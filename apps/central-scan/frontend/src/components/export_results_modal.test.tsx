import { err } from '@votingworks/basics';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { ExportResultsModal } from './export_results_modal';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/api';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('render insert USB screen when there is not a valid, mounted usb drive', async () => {
  const usbDriveStatuses: UsbDriveStatus[] = [
    { status: 'no_drive' },
    { status: 'ejected' },
    { status: 'error', reason: 'bad_format' },
  ];

  for (const usbDriveStatus of usbDriveStatuses) {
    apiMock.setUsbDriveStatus(usbDriveStatus);
    const closeFn = jest.fn();
    const { unmount } = renderInAppContext(
      <ExportResultsModal mode="cvrs" onClose={closeFn} />,
      {
        apiMock,
      }
    );
    await screen.findByText('No USB Drive Detected');
    screen.getByText('Insert a USB drive in order to save CVRs.');

    userEvent.click(screen.getByText('Cancel'));
    expect(closeFn).toHaveBeenCalled();
    unmount();
  }
});

test('render export modal when a usb drive is mounted as expected and allows export', async () => {
  const closeFn = jest.fn();
  apiMock.setUsbDriveStatus(mockUsbDriveStatus('mounted'));
  renderInAppContext(<ExportResultsModal mode="cvrs" onClose={closeFn} />, {
    apiMock,
  });
  await screen.findByText('Save CVRs');

  apiMock.expectExportCastVoteRecords({ isMinimalExport: true });
  userEvent.click(screen.getByText('Save'));
  await screen.findByText('CVRs Saved');

  userEvent.click(screen.getByText('Close'));
  expect(closeFn).toHaveBeenCalled();

  apiMock.expectEjectUsbDrive();
  userEvent.click(screen.getByText('Eject USB'));
  apiMock.setUsbDriveStatus(mockUsbDriveStatus('ejected'));
  await screen.findByText('USB Drive Ejected');
});

test('render export modal with errors when appropriate', async () => {
  const closeFn = jest.fn();
  apiMock.setUsbDriveStatus(mockUsbDriveStatus('mounted'));
  renderInAppContext(<ExportResultsModal mode="cvrs" onClose={closeFn} />, {
    apiMock,
  });
  await screen.findByText('Save CVRs');

  apiMock.apiClient.exportCastVoteRecordsToUsbDrive
    .expectCallWith({ isMinimalExport: true })
    .resolves(err({ type: 'file-system-error' }));
  userEvent.click(screen.getByText('Save'));
  await screen.findByText('Failed to Save CVRs');
  await screen.findByText('Unable to write to USB drive.');

  userEvent.click(screen.getByText('Close'));
  expect(closeFn).toHaveBeenCalled();
});

test('render export modal with errors when appropriate - backup', async () => {
  const closeFn = jest.fn();
  apiMock.setUsbDriveStatus(mockUsbDriveStatus('mounted'));
  renderInAppContext(<ExportResultsModal mode="backup" onClose={closeFn} />, {
    apiMock,
  });
  await screen.findByText('Save Backup');

  apiMock.apiClient.exportCastVoteRecordsToUsbDrive
    .expectCallWith({ isMinimalExport: false })
    .resolves(err({ type: 'file-system-error' }));
  userEvent.click(screen.getByText('Save'));
  await screen.findByText('Failed to Save Backup');
  await screen.findByText('Unable to write to USB drive.');

  userEvent.click(screen.getByText('Close'));
  expect(closeFn).toHaveBeenCalled();
});
