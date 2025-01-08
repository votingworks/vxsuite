/* eslint-disable no-console */
import React from 'react';
import { join } from 'node:path';
import { exists } from 'fs-extra';
import {
  ExportableData,
  ExportDataResult,
  Exporter,
} from '@votingworks/backend';
import { setInterval } from 'node:timers/promises';
import { renderToPdf } from '@votingworks/printing';
import { UsbDrive } from '@votingworks/usb-drive';
import { cp } from 'node:fs/promises';
import { Workspace } from './workspace';
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
  console.time('Exported backup voter checklist');
  const headerElement = React.createElement(VoterChecklistHeader);
  const tableElement = React.createElement(VoterChecklist, {
    voterGroups: workspace.store.groupVotersAlphabeticallyByLastName(),
  });
  const latestBackupPath = join(
    workspace.assetDirectoryPath,
    'latest_backup_voter_checklist.pdf'
  );
  const previousBackupPath = join(
    workspace.assetDirectoryPath,
    'previous_backup_voter_checklist.pdf'
  );
  if (await exists(latestBackupPath)) {
    await cp(latestBackupPath, previousBackupPath);
  }
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
  (await exportFile({ path: latestBackupPath, data: pdf })).unsafeUnwrap();
  console.timeEnd('Exported backup voter checklist');

  const usbDriveStatus = await usbDrive.status();
  if (usbDriveStatus.status === 'mounted') {
    console.time('Copied backup voter checklist to USB drive');
    await cp(
      latestBackupPath,
      join(usbDriveStatus.mountPoint, 'backup_voter_checklist.pdf')
    );
    console.timeEnd('Copied backup voter checklist to USB drive');
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of setInterval(BACKUP_INTERVAL)) {
      console.log('Exporting backup voter checklist');
      await exportBackupVoterChecklist(workspace, usbDrive);
    }
  });
}
