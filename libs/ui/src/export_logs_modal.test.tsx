import { expect, test } from 'vitest';
import { deferred, err, ok } from '@votingworks/basics';
import type { LogsResultType } from '@votingworks/backend';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { userEvent } from '@testing-library/user-event';
import { screen } from '../test/react_testing_library.js';
import { ExportLogsButton } from './export_logs_modal.js';
import { mockUsbDriveStatus } from './test-utils/mock_usb_drive.js';
import { newTestContext } from '../test/test_context.js';

const { mockApiClient, render } = newTestContext({
  skipUiStringsApi: true,
});

test('renders no log file found when usb is mounted but no log file on machine', async () => {
  mockApiClient.exportLogsToUsb.mockResolvedValueOnce(
    err({ code: 'no-logs-directory' })
  );

  render(<ExportLogsButton usbDriveStatus={mockUsbDriveStatus('mounted')} />);
  await userEvent.click(screen.getByText('Save Logs'));
  await userEvent.click(screen.getByText('Save'));
  await screen.findByText('no-logs-directory');
  expect(mockApiClient.exportLogsToUsb).toHaveBeenCalledTimes(1);
});

test('render no usb found screen when there is not a mounted usb drive', async () => {
  const usbStatuses: UsbDriveStatus[] = [
    { status: 'no_drive' },
    { status: 'ejected' },
  ];
  for (const status of usbStatuses) {
    const { unmount } = render(<ExportLogsButton usbDriveStatus={status} />);
    await userEvent.click(screen.getByText('Save Logs'));
    await screen.findByText('No USB Drive Detected');
    screen.getByText('Insert a USB drive to save logs.');

    await userEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByRole('alertdialog')).toBeFalsy();

    unmount();
  }
});

test('successful save default logs flow', async () => {
  const exportLogsToUsb = deferred<LogsResultType>();
  mockApiClient.exportLogsToUsb.mockReturnValueOnce(exportLogsToUsb.promise);

  render(<ExportLogsButton usbDriveStatus={mockUsbDriveStatus('mounted')} />);
  await userEvent.click(screen.getByText('Save Logs'));
  await screen.findByRole('heading', { name: 'Save Logs' });
  await userEvent.click(screen.getByText('Save'));
  await screen.findByText(/Saving Logs/);
  exportLogsToUsb.resolve(ok());
  await screen.findByText(/Logs Saved/);

  await userEvent.click(screen.getByText('Close'));
  expect(screen.queryByRole('alertdialog')).toBeFalsy();

  expect(mockApiClient.exportLogsToUsb).toHaveBeenCalledTimes(1);
  expect(mockApiClient.exportLogsToUsb).toHaveBeenCalledWith({ format: 'vxf' });
});

test('successful save cdf logs flow', async () => {
  const exportLogsToUsb = deferred<LogsResultType>();
  mockApiClient.exportLogsToUsb.mockReturnValueOnce(exportLogsToUsb.promise);

  render(<ExportLogsButton usbDriveStatus={mockUsbDriveStatus('mounted')} />);
  await userEvent.click(screen.getByText('Save Logs'));
  await screen.findByRole('heading', { name: 'Save Logs' });

  await userEvent.click(screen.getByText('CDF'));
  await screen.findByText(
    'It may take a few minutes to save logs in this format.'
  );

  await userEvent.click(screen.getByText('Save'));
  await screen.findByText(/Saving Logs/);
  exportLogsToUsb.resolve(ok());
  await screen.findByText(/Logs Saved/);
  await userEvent.click(screen.getByText('Close'));
  expect(screen.queryByRole('alertdialog')).toBeFalsy();

  expect(mockApiClient.exportLogsToUsb).toHaveBeenCalledTimes(1);
  expect(mockApiClient.exportLogsToUsb).toHaveBeenCalledWith({ format: 'cdf' });
});

test('successful save error logs flow', async () => {
  const exportLogsToUsb = deferred<LogsResultType>();
  mockApiClient.exportLogsToUsb.mockReturnValueOnce(exportLogsToUsb.promise);

  render(<ExportLogsButton usbDriveStatus={mockUsbDriveStatus('mounted')} />);
  await userEvent.click(screen.getByText('Save Logs'));
  await screen.findByRole('heading', { name: 'Save Logs' });

  await userEvent.click(screen.getByText('Errors'));
  await screen.findByText(
    'It may take a few minutes to save logs in this format.'
  );

  await userEvent.click(screen.getByText('Save'));
  await screen.findByText(/Saving Logs/);
  exportLogsToUsb.resolve(ok());
  await screen.findByText(/Logs Saved/);

  await userEvent.click(screen.getByText('Close'));
  expect(screen.queryByRole('alertdialog')).toBeFalsy();

  expect(mockApiClient.exportLogsToUsb).toHaveBeenCalledTimes(1);
  expect(mockApiClient.exportLogsToUsb).toHaveBeenCalledWith({ format: 'err' });
});
