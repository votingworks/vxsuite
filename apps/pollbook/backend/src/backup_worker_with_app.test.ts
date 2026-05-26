import { beforeEach, expect, test, vi } from 'vitest';
import { err } from '@votingworks/basics';
import { exportBackupVoterChecklist } from './backup_worker';
import { withApp } from '../test/app';
import { setupTestElectionAndVoters } from '../test/test_helpers';

beforeEach(() => {
  vi.clearAllMocks();
});

test('exportBackupVoterChecklist returns an error when no election is configured', async () => {
  await withApp(async ({ workspace, mockUsbDrive }) => {
    mockUsbDrive.insertUsbDrive({});
    const mountedUsbDrive = (
      await mockUsbDrive.usbDrive.mounted()
    ).unsafeUnwrap();
    const result = await exportBackupVoterChecklist(workspace, mountedUsbDrive);
    expect(result).toEqual(
      err(new Error('Machine not configured with election, skipping backup'))
    );
  });
});

test('exportBackupVoterChecklist returns an error when no precinct is configured', async () => {
  await withApp(async ({ workspace, mockUsbDrive }) => {
    mockUsbDrive.insertUsbDrive({});
    setupTestElectionAndVoters(workspace.store, {
      precinct: 'precinct-1',
    });
    const mountedUsbDrive = (
      await mockUsbDrive.usbDrive.mounted()
    ).unsafeUnwrap();
    const result = await exportBackupVoterChecklist(workspace, mountedUsbDrive);
    expect(result).toEqual(
      err(new Error('Machine not configured with precinct, skipping backup'))
    );
  });
});
