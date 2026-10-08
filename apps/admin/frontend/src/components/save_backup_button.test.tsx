import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { err } from '@votingworks/basics';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import type {
  BackupProgressEvent,
  BackupStatus,
} from '@votingworks/admin-backend';
import { mockUsbDriveStatus } from '@votingworks/ui';
import userEvent from '@testing-library/user-event';
import {
  type ApiMock,
  createApiMock,
} from '../../test/helpers/mock_api_client.js';
import { renderInAppContext } from '../../test/render_in_app_context.js';
import { screen, waitFor, within } from '../../test/react_testing_library.js';
import { DEFAULT_QUERY_REFETCH_INTERVAL } from '../utils/globals.js';
import { mockSavedBackupStatus } from '../../test/api_mock_data.js';
import { SaveBackupButton } from './save_backup_button.js';

const electionDefinition = readElectionGeneralDefinition();

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
  vi.useRealTimers();
});

function renderButton() {
  renderInAppContext(<SaveBackupButton />, { apiMock, electionDefinition });
}

function pollBackupStatus(status: BackupStatus | null) {
  apiMock.setBackupStatus(status);
  vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL);
}

async function expectModalClosed() {
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
}

test('asks for a backup drive when none is attached', async () => {
  apiMock.apiClient.getBackupDriveStatus
    .expectRepeatedCallsWith()
    .resolves(mockUsbDriveStatus('no_drive'));
  renderButton();

  userEvent.click(screen.getButton('Save Backup'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Insert Backup Drive' });
  within(modal).getByText('Insert a backup USB drive to continue.');

  userEvent.click(within(modal).getButton('Cancel'));
  await expectModalClosed();
});

test('continues once a backup drive is inserted', async () => {
  apiMock.apiClient.getBackupDriveStatus
    .expectRepeatedCallsWith()
    .resolves(mockUsbDriveStatus('no_drive'));
  renderButton();

  userEvent.click(screen.getButton('Save Backup'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Insert Backup Drive' });

  apiMock.apiClient.getBackupDriveStatus
    .expectRepeatedCallsWith()
    .resolves(mockUsbDriveStatus('mounted'));
  vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL);
  await within(modal).findByRole('heading', { name: 'Save Backup' });
  within(modal).getButton('Save Backup');
});

test.each<{ event: BackupProgressEvent; text: string; width: string }>([
  {
    event: { type: '1_preparing' },
    text: 'Preparing to save backup',
    width: '0%',
  },
  {
    event: { type: '2_db_snapshot', progress: 0.5 },
    text: 'Preparing to save backup',
    width: '0%',
  },
  {
    event: { type: '3_staging_files', progress: 0.5 },
    text: 'Preparing to save backup',
    width: '0%',
  },
  {
    event: {
      type: '4_copying_files',
      copiedCount: 1,
      totalCount: 2,
      copiedBytes: 256,
      totalBytes: 1024,
    },
    text: 'Saving files to backup drive',
    width: '25%',
  },
  {
    event: { type: '5_writing_manifest' },
    text: 'Finishing saving backup',
    width: '100%',
  },
  {
    event: { type: '6_flushing_backup' },
    text: 'Finishing saving backup',
    width: '100%',
  },
  {
    event: { type: '7_swapping_backup' },
    text: 'Finishing saving backup',
    width: '100%',
  },
  {
    event: { type: '8_flushing_swap' },
    text: 'Finishing saving backup',
    width: '100%',
  },
])(
  'shows the phase of a backup at $event.type',
  async ({ event, text, width }) => {
    apiMock.apiClient.getBackupDriveStatus
      .expectRepeatedCallsWith()
      .resolves(mockUsbDriveStatus('mounted'));
    apiMock.setBackupStatus({
      status: 'in-progress',
      lastProgressEvent: event,
    });
    renderButton();

    const modal = await screen.findByRole('alertdialog');
    within(modal).getByRole('heading', { name: 'Saving Backup' });
    within(modal).getByText(text);
    expect(
      within(modal).getByRole('progressbar').firstElementChild
    ).toHaveStyle(`width: ${width}`);
  }
);

test('saves a backup and shows its progress', async () => {
  apiMock.apiClient.getBackupDriveStatus
    .expectRepeatedCallsWith()
    .resolves(mockUsbDriveStatus('mounted'));
  renderButton();

  userEvent.click(screen.getButton('Save Backup'));
  let modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Save Backup' });
  userEvent.click(within(modal).getButton('Cancel'));
  await expectModalClosed();

  userEvent.click(screen.getButton('Save Backup'));
  modal = await screen.findByRole('alertdialog');
  apiMock.apiClient.startBackup.expectCallWith().resolves();
  userEvent.click(within(modal).getButton('Save Backup'));
  apiMock.setBackupStatus({ status: 'starting' });
  await within(modal).findByRole('heading', { name: 'Saving Backup' });
  within(modal).getByText('Preparing to save backup');
  expect(within(modal).getByRole('progressbar').firstElementChild).toHaveStyle(
    'width: 0%'
  );
  pollBackupStatus({
    status: 'in-progress',
    lastProgressEvent: {
      type: '4_copying_files',
      copiedCount: 1,
      totalCount: 2,
      copiedBytes: 512,
      totalBytes: 1024,
    },
  });
  await within(modal).findByText('Saving files to backup drive');
  expect(within(modal).getByRole('progressbar').firstElementChild).toHaveStyle(
    'width: 50%'
  );

  pollBackupStatus({
    status: 'in-progress',
    lastProgressEvent: { type: '8_flushing_swap' },
  });
  await within(modal).findByText('Finishing saving backup');
  expect(within(modal).getByRole('progressbar').firstElementChild).toHaveStyle(
    'width: 100%'
  );

  pollBackupStatus(mockSavedBackupStatus);
  await within(modal).findByRole('heading', { name: 'Backup Saved' });
  within(modal).getByText('You may remove the backup drive.');

  apiMock.apiClient.finishBackup.expectCallWith().resolves();
  userEvent.click(within(modal).getButton('Close'));
  apiMock.setBackupStatus(null);
  await expectModalClosed();
});

test('cancels a running backup', async () => {
  apiMock.apiClient.getBackupDriveStatus
    .expectRepeatedCallsWith()
    .resolves(mockUsbDriveStatus('mounted'));
  apiMock.setBackupStatus({
    status: 'in-progress',
    lastProgressEvent: { type: '1_preparing' },
  });
  renderButton();

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Saving Backup' });

  apiMock.apiClient.abortBackup.expectCallWith().resolves();
  userEvent.click(within(modal).getButton('Cancel Backup'));
  pollBackupStatus({
    status: 'ended',
    result: err({ type: 'cancelled', message: 'Backup cancelled' }),
  });
  await within(modal).findByRole('heading', { name: 'Backup Cancelled' });
  within(modal).getByText(
    'The backup was cancelled. You may remove the backup drive.'
  );

  apiMock.apiClient.finishBackup.expectCallWith().resolves();
  userEvent.click(within(modal).getButton('Close'));
  apiMock.setBackupStatus(null);
  await expectModalClosed();
});

test('reports a failed backup', async () => {
  apiMock.apiClient.getBackupDriveStatus
    .expectRepeatedCallsWith()
    .resolves(mockUsbDriveStatus('mounted'));
  apiMock.setBackupStatus({
    status: 'ended',
    result: err({
      type: 'backup-write-failed',
      message: 'ENOSPC: no space left on device',
    }),
  });
  renderButton();

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Backup Failed' });
  within(modal).getByText('The backup failed. Please try again.');

  apiMock.apiClient.finishBackup.expectCallWith().resolves();
  userEvent.click(within(modal).getButton('Close'));
  apiMock.setBackupStatus(null);
  await expectModalClosed();
});

test('a finished backup is shown even if the backup drive is gone', async () => {
  apiMock.apiClient.getBackupDriveStatus
    .expectRepeatedCallsWith()
    .resolves(mockUsbDriveStatus('no_drive'));
  apiMock.setBackupStatus(mockSavedBackupStatus);
  renderButton();

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Backup Saved' });
});
