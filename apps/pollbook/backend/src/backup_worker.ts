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
import { iter, range } from '@votingworks/basics';
import { PDFDocument } from 'pdf-lib';
import { Buffer } from 'node:buffer';
import { Workspace } from './types';
import { VoterChecklist, VoterChecklistHeader } from './voter_checklist';

const BACKUP_INTERVAL = 1_000 * 60; // 1 minute

export async function concatenatePdfs(pdfs: Buffer[]): Promise<Buffer> {
  const combinedPdf = await PDFDocument.create();
  for (const pdf of pdfs) {
    const pdfDoc = await PDFDocument.load(pdf);
    const copiedPages = await combinedPdf.copyPages(
      pdfDoc,
      pdfDoc.getPageIndices()
    );
    for (const page of copiedPages) {
      combinedPdf.addPage(page);
    }
  }
  return Buffer.from(await combinedPdf.save());
}

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
  const voterGroups = workspace.store.groupVotersAlphabeticallyByLastName();
  const totalCheckIns = workspace.store.getCheckInCount();
  const lastReceiptNumber = workspace.store.getNextReceiptNumber() - 1;
  const groupPdfs = iter(voterGroups)
    .async()
    .map(async (voterGroup) => {
      const headerElement = React.createElement(VoterChecklistHeader, {
        totalCheckIns,
        lastReceiptNumber,
        voterGroup,
      });
      const tableElement = React.createElement(VoterChecklist, {
        voterGroup,
      });
      return (
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
    });

  // For now, split into two PDFs so users can parallelize printing. In the
  // future we may want to decide this dynamically based on the number of
  // voters.
  const numPdfChunks = 2;
  const chunkLength = Math.ceil(voterGroups.length / numPdfChunks);
  for await (const [i, pdfs] of groupPdfs.chunks(chunkLength).enumerate()) {
    const workspaceBackupPath = join(
      workspace.assetDirectoryPath,
      `backup_voter_checklist_part_${i + 1}.pdf`
    );
    const pdf = await concatenatePdfs(pdfs);
    (await exportFile({ path: workspaceBackupPath, data: pdf })).unsafeUnwrap();
  }
  console.timeEnd('Exported backup voter checklist');

  usbDriveStatus = await usbDrive.status();
  if (usbDriveStatus.status === 'mounted') {
    console.time('Copied backup voter checklist to USB drive');
    for (const i of range(1, numPdfChunks + 1)) {
      const workspaceBackupPath = join(
        workspace.assetDirectoryPath,
        `backup_voter_checklist_part_${i}.pdf`
      );
      const usbBackupPath = join(
        usbDriveStatus.mountPoint,
        `backup_voter_checklist_part_${i}.pdf`
      );
      const usbInProgressPath = join(
        usbDriveStatus.mountPoint,
        `backup_voter_checklist_part_${i}.in_progress.pdf`
      );
      await cp(workspaceBackupPath, usbInProgressPath);
      await move(usbInProgressPath, usbBackupPath, { overwrite: true });
    }
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
