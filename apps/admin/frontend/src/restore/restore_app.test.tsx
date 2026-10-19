import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import { deferred, err, ok } from '@votingworks/basics';
import {
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import type {
  AvailableBackup,
  RestoreStatus,
} from '@votingworks/admin-backend';
import { DEV_MACHINE_ID, type DippedSmartCardAuth } from '@votingworks/types';
import { AUTH_STATUS_POLLING_INTERVAL_MS } from '@votingworks/ui';
import { DEFAULT_QUERY_REFETCH_INTERVAL } from '../utils/globals.js';
import {
  render,
  screen,
  waitFor,
  within,
} from '../../test/react_testing_library.js';
import {
  createRestoreApiMock,
  type RestoreApiMock,
} from '../../test/helpers/mock_restore_api_client.js';
import { mockBackupManifest } from '../../test/api_mock_data.js';
import { type ApiClient, createQueryClient } from './api.js';
import { RestoreApp } from './restore_app.js';

let apiMock: RestoreApiMock;
let queryClient: QueryClient;

const SYSTEM_ADMINISTRATOR_AUTH: DippedSmartCardAuth.AuthStatus = {
  status: 'logged_in',
  user: mockSystemAdministratorUser(),
  sessionExpiresAt: mockSessionExpiresAt(),
  programmableCard: { status: 'no_card' },
};

const BACKUP: AvailableBackup = {
  name: 'sample-county_general-election_abc123',
  path: '/media/vx/backup/vxadmin-backups/sample-county_general-election_abc123',
  manifestResult: ok(mockBackupManifest),
};

const OLDER_BACKUP: AvailableBackup = {
  name: 'sample-county_older-election_def456',
  path: '/media/vx/backup/vxadmin-backups/sample-county_older-election_def456',
  manifestResult: ok({
    ...mockBackupManifest,
    createdAt: '2026-09-08T12:00:00.000Z',
    election: { ...mockBackupManifest.election, title: 'Older Election' },
  }),
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createRestoreApiMock();
  queryClient = createQueryClient();
  apiMock.expectGetMachineConfig();
});

afterEach(() => {
  queryClient.clear();
  apiMock.assertComplete();
});

function renderRestoreApp() {
  const apiClient = apiMock.apiClient as unknown as ApiClient;
  return render(<RestoreApp apiClient={apiClient} queryClient={queryClient} />);
}

function setUnlockedWithDrive(restoreStatus: RestoreStatus | null = null) {
  apiMock.setAuthStatus(SYSTEM_ADMINISTRATOR_AUTH);
  apiMock.setBackupDriveStatus('mounted');
  apiMock.setRestoreStatus(restoreStatus);
}

test('asks for a system administrator card while locked', async () => {
  apiMock.setAuthStatus({ status: 'logged_out', reason: 'machine_locked' });
  renderRestoreApp();

  await screen.findByText('VxAdmin Locked');
  screen.getByText('Insert system administrator card to unlock.');
  screen.getByText('Restore Mode');
  screen.getByText(DEV_MACHINE_ID);
  screen.getButton('Exit Restore Mode');
});

test('asks for a system administrator card after the session expires', async () => {
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked_by_session_expiry',
  });
  renderRestoreApp();

  await screen.findByText('VxAdmin Locked');
});

test('turns away a card that is not a system administrator card', async () => {
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'user_role_not_allowed',
  });
  renderRestoreApp();

  await screen.findByText(/Use a system administrator card\./);
  screen.getByText('Restore Mode');
});

test('walks through the card reader, PIN, and remove-card states', async () => {
  apiMock.apiClient.getAuthStatus
    .expectCallWith()
    .resolves({ status: 'logged_out', reason: 'no_card_reader' });
  apiMock.apiClient.getAuthStatus
    .expectCallWith()
    .resolves({ status: 'checking_pin', user: mockSystemAdministratorUser() });
  apiMock.setAuthStatus({
    status: 'remove_card',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  renderRestoreApp();

  await screen.findByText('Card Reader Not Detected');
  await screen.findByText('Enter Card PIN');
  await screen.findByText(/Remove card to unlock/i);
});

test('shows the restore screen to a system administrator', async () => {
  apiMock.setAuthStatus(SYSTEM_ADMINISTRATOR_AUTH);
  apiMock.setBackupDriveStatus('no_drive');
  apiMock.setRestoreStatus(null);
  renderRestoreApp();

  await screen.findByRole('heading', { name: 'Restore from Backup' });
  screen.getByText('Restore Mode');
  screen.getByText(DEV_MACHINE_ID);
  screen.getButton('Exit Restore Mode');
});

test('asks for a backup USB drive until one is inserted', async () => {
  apiMock.setAuthStatus(SYSTEM_ADMINISTRATOR_AUTH);
  apiMock.setBackupDriveStatus('no_drive');
  apiMock.setRestoreStatus(null);
  apiMock.expectListAvailableBackups(ok([]));
  renderRestoreApp();

  await screen.findByText('Insert a backup USB drive');

  apiMock.setBackupDriveStatus('mounted');
  vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL);
  await waitFor(() =>
    expect(screen.queryByText('Insert a backup USB drive')).toBeNull()
  );
  await screen.findByText('No backups found on the inserted backup drive');

  apiMock.setBackupDriveStatus('no_drive');
  vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL);
  await screen.findByText('Insert a backup USB drive');
});

test('locks the machine on request', async () => {
  apiMock.setAuthStatus(SYSTEM_ADMINISTRATOR_AUTH);
  apiMock.setBackupDriveStatus('no_drive');
  apiMock.setRestoreStatus(null);
  apiMock.apiClient.logOut.expectCallWith().resolves();
  renderRestoreApp();

  (await screen.findButton('Lock Machine')).click();
  await waitFor(() => apiMock.apiClient.logOut.assertComplete());
});

test('exits restore mode after confirmation', async () => {
  apiMock.setAuthStatus({ status: 'logged_out', reason: 'machine_locked' });
  const reboot = deferred<void>();
  apiMock.apiClient.reboot.expectCallWith().returns(reboot.promise);
  renderRestoreApp();

  (await screen.findButton('Exit Restore Mode')).click();
  let modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Exit Restore Mode' });
  within(modal).getByText('VxAdmin will restart normally.');
  within(modal).getByRole('button', { name: 'Cancel' }).click();
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

  screen.getButton('Exit Restore Mode').click();
  modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('button', { name: 'Restart' }).click();
  await waitFor(() =>
    expect(
      within(modal).getByRole('button', { name: 'Restart' })
    ).toBeDisabled()
  );
  expect(within(modal).getByRole('button', { name: 'Cancel' })).toBeDisabled();

  reboot.resolve();
  await waitFor(() => expect(queryClient.isMutating()).toEqual(0));
  expect(within(modal).getByRole('button', { name: 'Restart' })).toBeDisabled();
  expect(within(modal).getByRole('button', { name: 'Cancel' })).toBeDisabled();
});

test('lists the backups on the drive and can select one to restore', async () => {
  setUnlockedWithDrive();
  apiMock.expectListAvailableBackups(ok([OLDER_BACKUP, BACKUP]));
  renderRestoreApp();

  await screen.findByText('Select a backup to restore from');
  expect(
    screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent)
  ).toEqual([
    'General Election · November 3, 2020',
    'Older Election · November 3, 2020',
  ]);

  screen
    .getByRole('heading', { name: 'General Election · November 3, 2020' })
    .click();
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Restore from Backup' });
  within(modal).getByText('Restore from this backup?');
  within(modal).getByRole('heading', {
    name: 'General Election · November 3, 2020',
  });

  const start = deferred<void>();
  apiMock.apiClient.startRestore
    .expectCallWith({ backupPath: BACKUP.path })
    .returns(start.promise);
  within(modal).getButton('Restore').click();
  await waitFor(() =>
    expect(within(modal).getButton('Restore')).toBeDisabled()
  );
  expect(within(modal).getButton('Cancel')).toBeDisabled();

  start.resolve();
  apiMock.setRestoreStatus({ status: 'starting' });
  vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL);
  await screen.findByRole('heading', { name: 'Restoring from Backup' });
  screen.getByText('Preparing to restore backup');
  expect(screen.getByRole('progressbar').firstElementChild).toHaveStyle(
    'width: 0%'
  );
});

test.each<{ status: RestoreStatus; text: string; progress: string }>([
  {
    status: { status: 'starting' },
    text: 'Preparing to restore backup',
    progress: '0%',
  },
  {
    status: {
      status: 'in-progress',
      lastProgressEvent: { type: '1_preparing' },
    },
    text: 'Preparing to restore backup',
    progress: '0%',
  },
  {
    status: {
      status: 'in-progress',
      lastProgressEvent: {
        type: '2_copying_files',
        copiedCount: 1,
        totalCount: 4,
        copiedBytes: 250,
        totalBytes: 1000,
      },
    },
    text: 'Restoring files from backup drive',
    progress: '25%',
  },
  {
    status: {
      status: 'in-progress',
      lastProgressEvent: { type: '3_verifying' },
    },
    text: 'Finishing restore',
    progress: '100%',
  },
  {
    status: {
      status: 'in-progress',
      lastProgressEvent: { type: '4_flushing_workspace' },
    },
    text: 'Finishing restore',
    progress: '100%',
  },
])(
  'shows the phase of a restore: $text at $progress',
  async ({ status, text, progress }) => {
    setUnlockedWithDrive(status);
    apiMock.expectListAvailableBackups(ok([BACKUP]));
    renderRestoreApp();

    const modal = await screen.findByRole('alertdialog');
    within(modal).getByRole('heading', { name: 'Restoring from Backup' });
    within(modal).getByText(text);
    expect(
      within(modal).getByRole('progressbar').firstElementChild
    ).toHaveStyle(`width: ${progress}`);
  }
);

test('cancels a running restore', async () => {
  setUnlockedWithDrive({
    status: 'in-progress',
    lastProgressEvent: { type: '1_preparing' },
  });
  apiMock.expectListAvailableBackups(ok([BACKUP]));
  const abort = deferred<void>();
  apiMock.apiClient.abortRestore.expectCallWith().returns(abort.promise);
  renderRestoreApp();

  const modal = await screen.findByRole('alertdialog');
  within(modal).getButton('Cancel Restore').click();
  await waitFor(() =>
    expect(within(modal).getButton('Cancel Restore')).toBeDisabled()
  );

  abort.resolve();
  apiMock.setRestoreStatus({
    status: 'ended',
    result: err({ type: 'cancelled', message: 'Restore cancelled' }),
  });
  vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL);
  await screen.findByRole('heading', { name: 'Restore Cancelled' });
  screen.getByText('The restore was cancelled.');

  const finish = deferred<void>();
  apiMock.apiClient.finishRestore.expectCallWith().returns(finish.promise);
  screen.getButton('Close').click();
  await waitFor(() => expect(screen.getButton('Close')).toBeDisabled());

  finish.resolve();
  apiMock.setRestoreStatus(null);
  vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL);
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  screen.getByText('Select a backup to restore from');
});

test('reports a failed restore and returns to the list', async () => {
  setUnlockedWithDrive({
    status: 'ended',
    result: err({ type: 'backup-read-failed', message: 'Missing backup file' }),
  });
  apiMock.expectListAvailableBackups(ok([BACKUP]));
  renderRestoreApp();

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Restore Failed' });
  within(modal).getByText('The restore failed. Please try again.');

  const finish = deferred<void>();
  apiMock.apiClient.finishRestore.expectCallWith().returns(finish.promise);
  within(modal).getButton('Close').click();
  await waitFor(() => expect(within(modal).getButton('Close')).toBeDisabled());
  finish.resolve();

  apiMock.setRestoreStatus(null);
  vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL);
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  screen.getByText('Select a backup to restore from');
});

test('prompts to restart once the backup is restored', async () => {
  setUnlockedWithDrive({ status: 'ended', result: ok() });
  apiMock.expectListAvailableBackups(ok([BACKUP]));
  const reboot = deferred<void>();
  apiMock.apiClient.reboot.expectCallWith().returns(reboot.promise);
  renderRestoreApp();

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Restore Complete' });
  within(modal).getByText(
    'You may remove the backup drive. Restart VxAdmin to continue.'
  );
  within(modal).getButton('Restart').click();
  await waitFor(() =>
    expect(within(modal).getButton('Restart')).toBeDisabled()
  );

  reboot.resolve();
  await waitFor(() => expect(queryClient.isMutating()).toEqual(0));
  expect(within(modal).getButton('Restart')).toBeDisabled();
});

test('warns about backups on the drive that cannot be read', async () => {
  setUnlockedWithDrive();
  apiMock.expectListAvailableBackups(
    ok([
      BACKUP,
      {
        name: 'corrupt-missing-manifest',
        path: '/media/vx/backup/vxadmin-backups/corrupt-missing-manifest',
        manifestResult: err({ type: 'read-failed', message: 'ENOENT' }),
      },
    ])
  );
  renderRestoreApp();

  await screen.findByText('Failed to load some backups on the backup drive:');
  screen.getByText('corrupt-missing-manifest');
  screen.getByRole('heading', { name: 'General Election · November 3, 2020' });
});

test('shows a message when the drive holds no backups', async () => {
  setUnlockedWithDrive();
  apiMock.expectListAvailableBackups(ok([]));
  renderRestoreApp();

  await screen.findByText('No backups found on the inserted backup drive');
});

test('warns when backups cannot be listed', async () => {
  setUnlockedWithDrive();
  apiMock.expectListAvailableBackups(
    err({ type: 'not-directory', message: 'vxadmin-backups is a file' })
  );
  renderRestoreApp();

  await screen.findByText(
    'Failed to load backups from the inserted backup drive'
  );
});

test('shows in-progress restore after the machine is locked and unlocked', async () => {
  setUnlockedWithDrive({
    status: 'in-progress',
    lastProgressEvent: { type: '1_preparing' },
  });
  apiMock.expectListAvailableBackups(ok([BACKUP]));
  apiMock.apiClient.logOut.expectCallWith().resolves();
  renderRestoreApp();

  const modal = await screen.findByRole('alertdialog');
  within(modal).getButton('Lock Machine').click();
  await waitFor(() => apiMock.apiClient.logOut.assertComplete());

  apiMock.setAuthStatus({ status: 'logged_out', reason: 'machine_locked' });
  vi.advanceTimersByTime(AUTH_STATUS_POLLING_INTERVAL_MS);
  await screen.findByText('VxAdmin Locked');
  expect(screen.queryByRole('alertdialog')).toBeNull();

  apiMock.expectListAvailableBackups(ok([BACKUP]));
  apiMock.setAuthStatus(SYSTEM_ADMINISTRATOR_AUTH);
  vi.advanceTimersByTime(AUTH_STATUS_POLLING_INTERVAL_MS);
  await screen.findByRole('heading', { name: 'Restoring from Backup' });
});

test('shows in-progress restore even if backup drive is removed', async () => {
  apiMock.setAuthStatus(SYSTEM_ADMINISTRATOR_AUTH);
  apiMock.setBackupDriveStatus('no_drive');
  apiMock.setRestoreStatus({
    status: 'in-progress',
    lastProgressEvent: { type: '3_verifying' },
  });
  renderRestoreApp();

  await screen.findByText('Insert a backup USB drive');
  await screen.findByRole('heading', { name: 'Restoring from Backup' });
  screen.getByText('Finishing restore');
});

test('a cancelled restore can be closed without the backup drive', async () => {
  apiMock.setAuthStatus(SYSTEM_ADMINISTRATOR_AUTH);
  apiMock.setBackupDriveStatus('no_drive');
  apiMock.setRestoreStatus({
    status: 'ended',
    result: err({ type: 'cancelled', message: 'Restore cancelled' }),
  });
  apiMock.apiClient.finishRestore.expectCallWith().resolves();
  renderRestoreApp();

  (await screen.findButton('Close')).click();
  await waitFor(() => apiMock.apiClient.finishRestore.assertComplete());
});

test('closes the confirm modal without starting a restore', async () => {
  setUnlockedWithDrive();
  apiMock.expectListAvailableBackups(ok([BACKUP]));
  renderRestoreApp();

  (
    await screen.findByRole('heading', {
      name: 'General Election · November 3, 2020',
    })
  ).click();
  const modal = await screen.findByRole('alertdialog');
  within(modal).getButton('Cancel').click();
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
});
