import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { err, ok } from '@votingworks/basics';
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import type {
  AvailableBackup,
  RestoreApi,
  RestoreStatus,
} from '@votingworks/admin-backend';
import {
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { DEV_MACHINE_ID, DippedSmartCardAuth } from '@votingworks/types';
import { mockUsbDriveStatus, SystemCallContextProvider } from '@votingworks/ui';
import { render, screen, waitFor } from '../../test/react_testing_library.js';
import { SharedApiClientContext, systemCallApi } from '../shared_api.js';
import { ApiClient, createQueryClient } from './api.js';
import { RestoreApp } from './restore_app.js';

type RestoreProgress = Extract<
  RestoreStatus,
  { state: 'restoring' }
>['progress'];

let apiMock: MockClient<RestoreApi>;
let queryClient: QueryClient;

const BACKUP: AvailableBackup = {
  name: 'sample-backup',
  path: '/media/usb/vxadmin-backups/sample-backup',
};

const SYSTEM_ADMINISTRATOR_AUTH: DippedSmartCardAuth.AuthStatus = {
  status: 'logged_in',
  user: mockSystemAdministratorUser(),
  sessionExpiresAt: mockSessionExpiresAt(),
  programmableCard: { status: 'no_card' },
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createMockClient<RestoreApi>();
  queryClient = createQueryClient();
  apiMock.getMachineConfig
    .expectCallWith()
    .resolves({ machineId: DEV_MACHINE_ID, codeVersion: 'dev' });
});

afterEach(() => {
  queryClient.clear();
  apiMock.assertComplete();
});

function renderRestoreApp() {
  const apiClient = apiMock as unknown as ApiClient;
  return render(
    <SharedApiClientContext.Provider value={apiClient}>
      <SystemCallContextProvider api={systemCallApi}>
        <RestoreApp apiClient={apiClient} queryClient={queryClient} />
      </SystemCallContextProvider>
    </SharedApiClientContext.Provider>
  );
}

function setUnlocked({
  usbDriveInserted = true,
  restoreStatus = { state: 'idle' },
}: {
  usbDriveInserted?: boolean;
  restoreStatus?: RestoreStatus;
} = {}) {
  apiMock.getAuthStatus
    .expectRepeatedCallsWith()
    .resolves(SYSTEM_ADMINISTRATOR_AUTH);
  apiMock.getRestoreStatus.expectRepeatedCallsWith().resolves(restoreStatus);

  // The backups are offered only while there is no restore to show instead.
  if (
    restoreStatus.state === 'restoring' ||
    restoreStatus.state === 'restored'
  ) {
    return;
  }
  apiMock.getUsbDriveStatus
    .expectRepeatedCallsWith()
    .resolves(mockUsbDriveStatus(usbDriveInserted ? 'mounted' : 'no_drive'));
  apiMock.listAvailableBackups
    .expectRepeatedCallsWith()
    .resolves(
      usbDriveInserted
        ? ok([BACKUP])
        : err({ type: 'no-usb-drive', message: 'No USB drive is inserted' })
    );
}

test('asks for a system administrator card while locked', async () => {
  apiMock.getAuthStatus
    .expectRepeatedCallsWith()
    .resolves({ status: 'logged_out', reason: 'machine_locked' });
  renderRestoreApp();

  await screen.findByText('VxAdmin Locked');
  screen.getByText(/restore mode/);
  screen.getByText(DEV_MACHINE_ID);
});

test('turns away a card that is not a system administrator card', async () => {
  apiMock.getAuthStatus
    .expectRepeatedCallsWith()
    .resolves({ status: 'logged_out', reason: 'user_role_not_allowed' });
  renderRestoreApp();

  await screen.findByText('Use a system administrator card.');
});

test('asks for a USB drive when none is inserted', async () => {
  setUnlocked({ usbDriveInserted: false });
  renderRestoreApp();

  await screen.findByRole('heading', { name: 'Restore Backup' });
  await screen.findByText('Insert a USB drive containing a VxAdmin backup.');
  expect(screen.getButton('Restart')).toBeEnabled();
});

test('lists the backups on the USB drive and restores the chosen one', async () => {
  setUnlocked();
  apiMock.restoreBackup
    .expectCallWith({ backupPath: BACKUP.path })
    .resolves(ok());
  renderRestoreApp();

  await screen.findByText('Backups on USB Drive');
  screen.getButton(`Restore ${BACKUP.name}`).click();

  await waitFor(() => apiMock.restoreBackup.assertComplete());
});

test('shows definite progress while files are copied', async () => {
  setUnlocked({
    restoreStatus: {
      state: 'restoring',
      backupPath: BACKUP.path,
      progress: {
        type: 'copy_files',
        copiedCount: 1,
        totalCount: 4,
        copiedBytes: 250,
        totalBytes: 1000,
      },
    },
  });
  apiMock.cancelRestore.expectCallWith().resolves();
  renderRestoreApp();

  await screen.findByText('Copying files (1 of 4)');
  const progressBar = screen.getByRole('progressbar');
  expect(progressBar.firstElementChild).toHaveStyle({ width: '25%' });
  expect(screen.getButton('Restart')).toBeDisabled();
  expect(screen.queryByText('Backups on USB Drive')).toBeNull();

  screen.getButton('Cancel Restore').click();
  await waitFor(() => apiMock.cancelRestore.assertComplete());
});

test('shows indeterminate progress while the extent of the work is unknown', async () => {
  setUnlocked({
    restoreStatus: {
      state: 'restoring',
      backupPath: BACKUP.path,
      progress: { type: 'verifying' },
    },
  });
  renderRestoreApp();

  await screen.findByText('Verifying restored files');
  screen.getByRole('progressbar', { name: 'In progress' });
});

test('offers a restart once the backup is restored', async () => {
  setUnlocked({
    restoreStatus: { state: 'restored', backupPath: BACKUP.path },
  });
  apiMock.reboot.expectCallWith().resolves();
  renderRestoreApp();

  await screen.findByText('Backup restored. Restart VxAdmin to use it.');
  expect(screen.queryByText('Backups on USB Drive')).toBeNull();

  screen.getButton('Restart').click();
  await waitFor(() => apiMock.reboot.assertComplete());
});

test('reports a failed restore and offers the backups again', async () => {
  setUnlocked({
    restoreStatus: {
      state: 'failed',
      backupPath: BACKUP.path,
      error: { type: 'backup-read-failed', message: 'Missing backup file' },
    },
  });
  renderRestoreApp();

  await screen.findByText('Restore failed: Missing backup file');
  await screen.findByText('Backups on USB Drive');
});

test('walks through the card reader, PIN, and remove-card states', async () => {
  apiMock.getAuthStatus
    .expectCallWith()
    .resolves({ status: 'logged_out', reason: 'no_card_reader' });
  apiMock.getAuthStatus.expectCallWith().resolves({
    status: 'checking_pin',
    user: mockSystemAdministratorUser(),
  });
  apiMock.getAuthStatus
    .expectRepeatedCallsWith()
    .resolves({ status: 'remove_card', user: mockSystemAdministratorUser() });
  renderRestoreApp();

  await screen.findByText('Card Reader Not Detected');
  await screen.findByText('Enter Card PIN');
  await screen.findByText('Remove card to unlock VxAdmin');
});

test.each<{ progress: RestoreProgress; label: string }>([
  { progress: undefined, label: 'Preparing to restore' },
  { progress: { type: 'preparing' }, label: 'Preparing to restore' },
  {
    progress: {
      type: 'copy_files',
      copiedCount: 0,
      totalCount: 0,
      copiedBytes: 0,
      totalBytes: 0,
    },
    label: 'Copying files (0 of 0)',
  },
  {
    progress: { type: 'flushing_workspace' },
    label: 'Writing restored files to disk',
  },
  // A backup's event, which a restore never sends, still shows movement.
  { progress: { type: 'db_snapshot', progress: 0.5 }, label: 'Restoring' },
])('shows indeterminate progress for $label', async ({ progress, label }) => {
  setUnlocked({
    restoreStatus: { state: 'restoring', backupPath: BACKUP.path, progress },
  });
  renderRestoreApp();

  await screen.findByText(label);
  screen.getByRole('progressbar', { name: 'In progress' });
});

test('reports a cancelled restore', async () => {
  setUnlocked({
    restoreStatus: {
      state: 'failed',
      backupPath: BACKUP.path,
      error: { type: 'cancelled', message: 'Restore cancelled' },
    },
  });
  renderRestoreApp();

  await screen.findByText('Restore cancelled.');
});

test('explains a USB drive whose backups cannot be read', async () => {
  apiMock.getAuthStatus
    .expectRepeatedCallsWith()
    .resolves(SYSTEM_ADMINISTRATOR_AUTH);
  apiMock.getRestoreStatus
    .expectRepeatedCallsWith()
    .resolves({ state: 'idle' });
  apiMock.getUsbDriveStatus
    .expectRepeatedCallsWith()
    .resolves(mockUsbDriveStatus('mounted'));
  apiMock.listAvailableBackups
    .expectRepeatedCallsWith()
    .resolves(
      err({ type: 'not-directory', message: 'vxadmin-backups is a file' })
    );
  renderRestoreApp();

  await screen.findByText(/Could not read backups from the USB drive/);
  screen.getByText(/vxadmin-backups is a file/);
});

test('says so when the USB drive holds no backups', async () => {
  apiMock.getAuthStatus
    .expectRepeatedCallsWith()
    .resolves(SYSTEM_ADMINISTRATOR_AUTH);
  apiMock.getRestoreStatus
    .expectRepeatedCallsWith()
    .resolves({ state: 'idle' });
  apiMock.getUsbDriveStatus
    .expectRepeatedCallsWith()
    .resolves(mockUsbDriveStatus('mounted'));
  apiMock.listAvailableBackups.expectRepeatedCallsWith().resolves(ok([]));
  renderRestoreApp();

  await screen.findByText('No backups were found on the USB drive.');
});

test('locks the machine on request', async () => {
  setUnlocked();
  apiMock.logOut.expectCallWith().resolves();
  renderRestoreApp();

  (await screen.findButton('Lock Machine')).click();
  await waitFor(() => apiMock.logOut.assertComplete());
});
