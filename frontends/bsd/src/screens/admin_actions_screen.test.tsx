import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { electionSampleDefinition as testElectionDefinition } from '@votingworks/fixtures';
import { fakeKiosk } from '@votingworks/test-utils';
import { err, ok } from '@votingworks/basics';
import { deferred } from '@votingworks/basics';
import MockDate from 'mockdate';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { renderInAppContext } from '../../test/render_in_app_context';
import {
  AdminActionScreenProps,
  AdminActionsScreen,
} from './admin_actions_screen';

type BackupFn = AdminActionScreenProps['backup'];
type BackupResult = BackupFn extends (...args: any[]) => Promise<infer R>
  ? R
  : never;

function renderScreen(props: Partial<AdminActionScreenProps> = {}) {
  return renderInAppContext(
    <AdminActionsScreen
      hasBatches={false}
      unconfigureServer={jest.fn()}
      zeroData={jest.fn()}
      backup={jest.fn()}
      canUnconfigure={false}
      isTestMode={false}
      isTogglingTestMode={false}
      toggleTestMode={jest.fn()}
      setMarkThresholdOverrides={jest.fn()}
      markThresholds={undefined}
      electionDefinition={testElectionDefinition}
      {...props}
    />
  );
}

test('clicking "Save Backup" shows progress', async () => {
  const backup = jest.fn<ReturnType<BackupFn>, Parameters<BackupFn>>();
  renderScreen({ backup });

  const { resolve, promise } = deferred<BackupResult>();
  backup.mockReturnValueOnce(promise);

  await act(async () => {
    // Click to backup, verify we got called.
    const backupButton = screen.getByText('Save Backup');
    expect(backup).not.toHaveBeenCalled();
    backupButton.click();
    expect(backup).toHaveBeenCalledTimes(1);

    // Verify progress modal is shown.
    await waitFor(() => {
      const modal = screen.getByRole('alertdialog');
      within(modal).getByText('Saving Backup');
      screen.getByText('Saving…');
    });

    // Trigger backup finished, verify back to normal.
    resolve(ok(['/media/usb-drive-sdb1/backup.zip']));
    await waitFor(() => screen.getByText('Save Backup'));
    expect(screen.queryAllByRole('alertdialog').length).toEqual(0);
  });
});

test('"Delete Ballot Data" and Delete Election Data from VxCentralScan" disabled when canUnconfigure is falsy', () => {
  const unconfigureServer = jest.fn();
  const zeroData = jest.fn();
  renderScreen({
    unconfigureServer,
    zeroData,
    hasBatches: true,
  });

  // Clicking the disabled "Delete Election Data" button should do nothing
  const unconfigureButton = screen.getByText(
    'Delete Election Data from VxCentralScan'
  );
  unconfigureButton.click();
  expect(unconfigureServer).not.toHaveBeenCalled();
  expect(screen.queryByText('Delete all election data?')).toBeNull();

  // Clicking the disabled "Delete Ballot Data" button should do nothing
  const deleteBallotsButton = screen.getByText('Delete Ballot Data');
  deleteBallotsButton.click();
  expect(zeroData).not.toHaveBeenCalled();
  expect(screen.queryByText('Delete All Scanned Ballot Data?')).toBeNull();
});

test('"Delete Ballot Data" and Delete Election Data from VxCentralScan" enabled in test mode even if data not backed up', () => {
  renderScreen({ hasBatches: true, isTestMode: true });

  // Clicking the disabled "Delete Election Data" button should bring up a confirmation modal
  const unconfigureButton = screen.getByText(
    'Delete Election Data from VxCentralScan'
  );
  unconfigureButton.click();
  screen.getByText('Delete all election data?');

  // Clicking the disabled "Delete Ballot Data" button should bring up a confirmation modal
  const deleteBallotsButton = screen.getByText('Delete Ballot Data');
  deleteBallotsButton.click();
  screen.getByText('Delete All Scanned Ballot Data?');
});

test('clicking "Delete Election Data from VxCentralScan" shows progress', async () => {
  const unconfigureServer = jest.fn();
  renderScreen({ unconfigureServer, canUnconfigure: true });

  let resolve!: () => void;
  unconfigureServer.mockReturnValueOnce(
    new Promise<void>((res) => {
      resolve = res;
    })
  );

  // Click to reset.
  expect(unconfigureServer).not.toHaveBeenCalled();
  const resetButton = screen.getByText(
    'Delete Election Data from VxCentralScan'
  );
  resetButton.click();

  // Confirm reset.
  expect(unconfigureServer).not.toHaveBeenCalled();
  screen.getByText('Delete all election data?');
  const confirmResetButton = await waitFor(() =>
    screen.getByText('Yes, Delete Election Data')
  );
  confirmResetButton.click();
  screen.getByText('Are you sure?');
  const doubleConfirmResetButton = await waitFor(() =>
    screen.getByText('I am sure. Delete all election data.')
  );
  doubleConfirmResetButton.click();
  expect(unconfigureServer).toHaveBeenCalledTimes(1);

  // Verify progress message is shown.
  await waitFor(() => screen.getByText('Deleting election data'));

  // Trigger reset finished, verify back to initial screen.
  resolve();
  await waitFor(() => !screen.getByText('Deleting election data'));
});

test('clicking "Delete Ballot Data" shows progress', async () => {
  const zeroData = jest.fn();
  renderScreen({ zeroData, hasBatches: true, canUnconfigure: true });

  let resolve!: () => void;
  zeroData.mockReturnValueOnce(
    new Promise<void>((res) => {
      resolve = res;
    })
  );

  expect(zeroData).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Delete Ballot Data'));

  expect(zeroData).not.toHaveBeenCalled();
  await screen.findByText('Delete All Scanned Ballot Data?');
  fireEvent.click(screen.getByText('Yes, Delete Ballot Data'));
  expect(zeroData).toHaveBeenCalledTimes(1);

  // Verify progress message is shown.
  await screen.findByText('Deleting ballot data');

  resolve();
  // Trigger delete finished, verify back to initial screen.
  // eslint-disable-next-line @typescript-eslint/require-await
  await waitFor(async () => {
    expect(screen.queryAllByText('Deleting ballot data')).toHaveLength(0);
  });
});

test('backup error shows message', async () => {
  const backup = jest.fn<ReturnType<BackupFn>, Parameters<BackupFn>>();
  renderScreen({ backup });

  const { resolve, promise } = deferred<BackupResult>();
  backup.mockReturnValueOnce(promise);

  await act(async () => {
    // Click to backup, verify we got called.
    const backupButton = screen.getByText('Save Backup');
    expect(backup).not.toHaveBeenCalled();
    backupButton.click();
    expect(backup).toHaveBeenCalledTimes(1);

    // Verify progress message is shown.
    await waitFor(() => screen.getByText('Saving…'));

    // Trigger backup error, verify back to normal with error.
    resolve(err({ type: 'permission-denied', message: 'Permission Denied' }));
    await waitFor(() => screen.getByText('Save Backup'));
    await waitFor(() => screen.getByText('Permission Denied'));
  });
});

test('override mark thresholds button shows when there are no overrides', () => {
  const backup = jest.fn();

  const testCases = [
    {
      hasBatches: true,
      markThresholds: undefined,
      expectedText: 'Override Mark Thresholds',
      expectButtonDisabled: true,
    },
    {
      hasBatches: true,
      markThresholds: { marginal: 0.3, definite: 0.4 },
      expectedText: 'Reset Mark Thresholds',
      expectButtonDisabled: true,
    },
    {
      hasBatches: false,
      markThresholds: undefined,
      expectedText: 'Override Mark Thresholds',
      expectButtonDisabled: false,
    },
    {
      hasBatches: false,
      markThresholds: { marginal: 0.3, definite: 0.4 },
      expectedText: 'Reset Mark Thresholds',
      expectButtonDisabled: false,
    },
  ];

  for (const testCase of testCases) {
    const { getByText, unmount } = renderScreen({
      backup,
      hasBatches: testCase.hasBatches,
      markThresholds: testCase.markThresholds,
    });
    getByText(testCase.expectedText);
    expect(
      getByText(testCase.expectedText)
        .closest('button')!
        .hasAttribute('disabled')
    ).toEqual(testCase.expectButtonDisabled);
    unmount();
  }
});

test('clicking "Update Date and Time" shows modal to set clock', async () => {
  MockDate.set('2020-10-31T00:00:00.000Z');
  window.kiosk = fakeKiosk();

  renderScreen();

  screen.getByRole('heading', { name: 'Admin Actions' });

  // We just do a simple happy path test here, since the libs/ui/set_clock unit
  // tests cover full behavior
  userEvent.click(screen.getByRole('button', { name: 'Update Date and Time' }));

  // Open modal
  const modal = screen.getByRole('alertdialog');
  within(modal).getByText('Sat, Oct 31, 2020, 12:00 AM');

  // Change date
  const selectYear = screen.getByTestId('selectYear');
  userEvent.selectOptions(selectYear, '2025');

  // Save date
  userEvent.click(within(modal).getByRole('button', { name: 'Save' }));
  await waitFor(() => {
    expect(window.kiosk?.setClock).toHaveBeenCalledWith({
      isoDatetime: '2025-10-31T00:00:00.000+00:00',
      // eslint-disable-next-line vx/gts-identifiers
      IANAZone: 'UTC',
    });
  });
});
