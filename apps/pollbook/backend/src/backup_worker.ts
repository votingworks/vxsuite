/* eslint-disable no-console */
import React from 'react';
import { join } from 'node:path';
import { move } from 'fs-extra';
import {
  ExportableData,
  ExportDataResult,
  Exporter,
} from '@votingworks/backend';
import { setInterval } from 'node:timers/promises';
import { renderToPdf } from '@votingworks/printing';
import { UsbDrive } from '@votingworks/usb-drive';
import { cp } from 'node:fs/promises';
import { Workspace } from './types';
import { VoterChecklist, VoterChecklistHeader } from './voter_checklist';

const BACKUP_INTERVAL = 1_000 * 60; // 1 minute

/**
 * Save a file to disk.
 */
export function exportFile({
  path,
  data,
}: {
  path: string;
  data: ExportableData;
}): Promise<ExportDataResult> {
  const exporter = new Exporter({
    allowedExportPatterns: ['**'], // TODO restrict allowed export paths
    /* We're not using `exportDataToUsbDrive` here, so a mock `usbDrive` is OK */
    usbDrive: {
      status:
        /* istanbul ignore next */
        () =>
          Promise.resolve({
            status: 'no_drive',
          }),

      eject:
        /* istanbul ignore next */
        () => Promise.resolve(),
      format:
        /* istanbul ignore next */
        () => Promise.resolve(),
      sync:
        /* istanbul ignore next */
        () => Promise.resolve(),
    },
  });

  return exporter.exportData(path, data);
}

async function exportBackupVoterChecklist(
  workspace: Workspace,
  usbDrive: UsbDrive
): Promise<void> {
  let usbDriveStatus = await usbDrive.status();
  if (usbDriveStatus.status !== 'mounted') {
    console.log('No USB drive mounted, skipping backup');
    return;
  }
  if (!workspace.store.getElection()) {
    console.log('Machine not configured, skipping backup');
    return;
  }
  console.log('Exporting backup voter checklist');
  console.time('Exported backup voter checklist');
  const headerElement = React.createElement(VoterChecklistHeader, {
    totalCheckIns: workspace.store.getCheckInCount(),
  });
  const tableElement = React.createElement(VoterChecklist, {
    voterGroups: workspace.store.groupVotersAlphabeticallyByLastName(),
  });
  const workspaceBackupPath = join(
    workspace.assetDirectoryPath,
    'backup_voter_checklist.pdf'
  );
  const pdf = (
    await renderToPdf({
      headerTemplate: headerElement,
      document: tableElement,
      landscape: true,
      marginDimensions: {
        top: 0.7, // Leave space for header
        right: 0.25,
        bottom: 0.25,
        left: 0.25,
      },
    })
  ).unsafeUnwrap();
  (await exportFile({ path: workspaceBackupPath, data: pdf })).unsafeUnwrap();
  console.timeEnd('Exported backup voter checklist');

  usbDriveStatus = await usbDrive.status();
  if (usbDriveStatus.status === 'mounted') {
    console.time('Copied backup voter checklist to USB drive');
    const usbBackupPath = join(
      usbDriveStatus.mountPoint,
      'backup_voter_checklist.pdf'
    );
    const usbInProgressPath = join(
      usbDriveStatus.mountPoint,
      'backup_voter_checklist.in_progress.pdf'
    );
    await cp(workspaceBackupPath, usbInProgressPath);
    await move(usbInProgressPath, usbBackupPath, { overwrite: true });
    await usbDrive.sync();
    console.timeEnd('Copied backup voter checklist to USB drive');
  } else {
    console.log('No USB drive mounted, skipping copy');
  }
}

export function start({
  workspace,
  usbDrive,
}: {
  workspace: Workspace;
  usbDrive: UsbDrive;
}): void {
  console.log('Starting VxPollbook backup worker');
  process.nextTick(async () => {
    await exportBackupVoterChecklist(workspace, usbDrive);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of setInterval(BACKUP_INTERVAL)) {
      await exportBackupVoterChecklist(workspace, usbDrive);
    }
  });
}
