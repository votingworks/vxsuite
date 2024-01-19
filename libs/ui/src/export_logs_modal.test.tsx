import {
  fakeSystemAdministratorUser,
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
} from '@votingworks/test-utils';

import { err, ok } from '@votingworks/basics';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import userEvent from '@testing-library/user-event';
import { DippedSmartCardAuth } from '@votingworks/types';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { screen } from '../test/react_testing_library';
import { ExportLogsButton } from './export_logs_modal';
import { mockUsbDriveStatus } from './test-utils/mock_usb_drive';
import { newTestContext } from '../test/test_context';

const systemAdministratorAuthStatus: DippedSmartCardAuth.SystemAdministratorLoggedIn =
  {
    status: 'logged_in',
    user: fakeSystemAdministratorUser(),
    sessionExpiresAt: fakeSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  };

const electionManagerAuthStatus: DippedSmartCardAuth.ElectionManagerLoggedIn = {
  status: 'logged_in',
  user: fakeElectionManagerUser(),
  sessionExpiresAt: fakeSessionExpiresAt(),
};

const { mockApiClient, render } = newTestContext({
  skipUiStringsApi: true,
});

test('renders no log file found when usb is mounted but no log file on machine', async () => {
  const logger = fakeLogger();

  mockApiClient.exportLogsToUsb.mockResolvedValueOnce(err('no-logs-directory'));

  render(
    <ExportLogsButton
      usbDriveStatus={mockUsbDriveStatus('mounted')}
      logger={logger}
      auth={electionManagerAuthStatus}
    />
  );
  userEvent.click(screen.getByText('Save Log File'));
  userEvent.click(screen.getByText('Save'));
  await screen.findByText('Failed to save log file. no-logs-directory');
  expect(mockApiClient.exportLogsToUsb).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    expect.objectContaining({ disposition: 'failure' })
  );
});

test('render no usb found screen when there is not a mounted usb drive', async () => {
  const usbStatuses: UsbDriveStatus[] = [
    { status: 'no_drive' },
    { status: 'ejected' },
  ];
  for (const status of usbStatuses) {
    const { unmount } = render(
      <ExportLogsButton
        usbDriveStatus={status}
        logger={fakeLogger()}
        auth={systemAdministratorAuthStatus}
      />
    );
    userEvent.click(screen.getByText('Save Log File'));
    await screen.findByText('No USB Drive Detected');
    screen.getByText(
      'Please insert a USB drive where you would like the save the log file.'
    );
    screen.getByAltText('Insert USB Image');

    userEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByRole('alertdialog')).toBeFalsy();

    unmount();
  }
});

test('successful save raw logs flow', async () => {
  const logger = fakeLogger();

  mockApiClient.exportLogsToUsb.mockResolvedValueOnce(ok());

  render(
    <ExportLogsButton
      usbDriveStatus={mockUsbDriveStatus('mounted')}
      logger={logger}
      auth={electionManagerAuthStatus}
    />
  );
  userEvent.click(screen.getByText('Save Log File'));
  await screen.findByText('Save Logs');
  userEvent.click(screen.getByText('Save'));
  await screen.findByText(/Saving Logs/);
  await screen.findByText(/Logs Saved/);

  userEvent.click(screen.getByText('Close'));
  expect(screen.queryByRole('alertdialog')).toBeFalsy();

  expect(mockApiClient.exportLogsToUsb).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    expect.objectContaining({
      disposition: 'success',
      fileType: 'logs',
    })
  );
});
