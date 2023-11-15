import {
  fakeSystemAdministratorUser,
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
} from '@votingworks/test-utils';
import { LogFileType } from '@votingworks/utils';

import { err, ok } from '@votingworks/basics';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import userEvent from '@testing-library/user-event';
import { DippedSmartCardAuth } from '@votingworks/types';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { act, render, screen } from '../test/react_testing_library';
import {
  ExportLogsButton,
  ExportLogsButtonGroup,
  ExportLogsButtonRow,
} from './export_logs_modal';
import { mockUsbDriveStatus } from './test-utils/mock_usb_drive';

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

jest.useFakeTimers();

test('renders no log file found when usb is mounted but no log file on machine', async () => {
  const logger = fakeLogger();

  const onExportLogs = jest.fn().mockResolvedValue(err('no-log-directory'));

  render(
    <ExportLogsButton
      logFileType={LogFileType.Raw}
      usbDriveStatus={mockUsbDriveStatus('mounted')}
      logger={logger}
      auth={electionManagerAuthStatus}
      onExportLogs={onExportLogs}
    />
  );
  userEvent.click(screen.getByText('Save Log File'));
  userEvent.click(screen.getByText('Save'));
  await screen.findByText('Failed to save log file. no-log-directory');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    expect.objectContaining({ disposition: 'failure' })
  );
});

test('render no usb found screen when there is not a mounted usb drive', async () => {
  const onExportLogs = jest.fn();

  const usbStatuses: UsbDriveStatus[] = [
    { status: 'no_drive' },
    { status: 'ejected' },
  ];
  for (const status of usbStatuses) {
    const { unmount } = render(
      <ExportLogsButton
        logFileType={LogFileType.Raw}
        usbDriveStatus={status}
        logger={fakeLogger()}
        onExportLogs={onExportLogs}
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

  const onExportLogs = jest.fn().mockResolvedValue(ok());

  render(
    <ExportLogsButton
      logFileType={LogFileType.Raw}
      usbDriveStatus={mockUsbDriveStatus('mounted')}
      logger={logger}
      auth={electionManagerAuthStatus}
      onExportLogs={onExportLogs}
    />
  );
  userEvent.click(screen.getByText('Save Log File'));
  await screen.findByText('Save Logs');
  userEvent.click(screen.getByText('Save'));
  await screen.findByText(/Saving Logs/);
  act(() => {
    jest.advanceTimersByTime(2001);
  });
  await screen.findByText(/Logs Saved/);

  userEvent.click(screen.getByText('Close'));
  expect(screen.queryByRole('alertdialog')).toBeFalsy();

  expect(onExportLogs).toHaveBeenCalledWith(LogFileType.Raw);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    expect.objectContaining({
      disposition: 'success',
      fileType: 'logs',
    })
  );
});

test('button row renders both buttons', () => {
  const onExportLogs = jest.fn().mockResolvedValue(err('no-log-directory'));

  render(
    <ExportLogsButtonRow
      usbDriveStatus={mockUsbDriveStatus('mounted')}
      logger={fakeLogger()}
      auth={electionManagerAuthStatus}
      onExportLogs={onExportLogs}
    />
  );

  expect(screen.getButton('Save Log File')).toBeEnabled();

  // CDF button is disabled for now
  expect(screen.getButton('Save CDF Log File')).toBeDisabled();
});

test('button group renders both buttons', () => {
  const onExportLogs = jest.fn().mockResolvedValue(err('no-log-directory'));

  render(
    <ExportLogsButtonGroup
      usbDriveStatus={mockUsbDriveStatus('mounted')}
      logger={fakeLogger()}
      auth={electionManagerAuthStatus}
      onExportLogs={onExportLogs}
    />
  );

  expect(screen.getButton('Save Log File')).toBeEnabled();

  // without an election definition, CDF button should be disabled
  expect(screen.getButton('Save CDF Log File')).toBeDisabled();
});
