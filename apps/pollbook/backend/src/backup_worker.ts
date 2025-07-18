/* eslint-disable no-console */
import React from 'react';
import { join } from 'node:path';
import { move } from 'fs-extra';
import { Exporter } from '@votingworks/backend';
import { setInterval } from 'node:timers/promises';
import { MarginDimensions, renderToPdf } from '@votingworks/printing';
import { UsbDrive } from '@votingworks/usb-drive';
import { assertDefined, iter } from '@votingworks/basics';
import { PDFDocument } from 'pdf-lib';

import { PartyAbbreviation, LocalWorkspace } from './types';
import {
  CertificationPage,
  CoverPage,
  VoterChecklist,
  VoterChecklistHeader,
} from './voter_checklist';
import { LocalStore } from './local_store';

const BACKUP_INTERVAL = 1_000 * 60; // 1 minute

export async function concatenatePdfs(pdfs: Uint8Array[]): Promise<Uint8Array> {
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
  return Uint8Array.from(await combinedPdf.save());
}

async function* splitIntoBalancedChunks<T>(
  items: AsyncIterable<T>,
  itemWeights: number[],
  numChunks: number
): AsyncIterable<T[]> {
  // Use a greedy algorithm, building up chunks in order until they meet a
  // target weight. For later, we may consider a more optimal algorithm that
  // considers all possible splits.
  const totalWeight = iter(itemWeights).sum();
  const averageWeight = totalWeight / numChunks;
  const weightRange = Math.max(...itemWeights) - Math.min(...itemWeights);
  const targetWeight = averageWeight + weightRange / 2;
  let currentChunk: T[] = [];
  let currentChunkWeight = 0;
  let numChunksYielded = 0;
  for await (const [i, item] of iter(items).enumerate()) {
    const weight = itemWeights[i];
    if (
      currentChunkWeight + weight >= targetWeight &&
      numChunksYielded < numChunks - 1
    ) {
      yield currentChunk;
      numChunksYielded += 1;
      currentChunk = [];
      currentChunkWeight = 0;
    }
    currentChunk.push(item);
    currentChunkWeight += weight;
  }
  if (currentChunk.length > 0) {
    yield currentChunk;
  }
}

export async function getBackupPaperChecklistPdfs(
  store: LocalStore,
  exportTime: Date = new Date()
): Promise<Uint8Array[]> {
  const election = assertDefined(store.getElection());
  const voterGroups = store.groupVotersAlphabeticallyByLastName();
  const totalCheckIns = store.getCheckInCount();
  const lastEventPerMachine = store.getMostRecentEventIdPerMachine();
  const { configuredPrecinctId } = store.getPollbookConfigurationInformation();
  const configuredPrecinct = configuredPrecinctId
    ? election.precincts.find((p) => p.id === configuredPrecinctId)
    : undefined;
  const marginDimensions: MarginDimensions = {
    top: 0.7, // Leave space for header
    right: 0.25,
    bottom: 0.25,
    left: 0.25,
  };

  const coverPage = React.createElement(CoverPage, {
    election,
    totalCheckIns,
    exportTime,
    lastEventPerMachine,
    configuredPrecinct,
  });
  const coverPdf = (
    await renderToPdf({
      document: coverPage,
      landscape: true,
      marginDimensions: {
        ...marginDimensions,
        top: marginDimensions.bottom,
      },
    })
  ).unsafeUnwrap();

  const groupPdfs = iter(voterGroups)
    .async()
    .map(async ([letter, voterGroup]) => {
      const headerElement = React.createElement(VoterChecklistHeader, {
        election,
        letter,
        configuredPrecinct,
      });
      const tableElement = React.createElement(VoterChecklist, {
        voterGroup,
      });
      return (
        await renderToPdf({
          headerTemplate: headerElement,
          document: tableElement,
          landscape: true,
          marginDimensions,
        })
      ).unsafeUnwrap();
    });

  const voterCountByParty = store
    .getAllVotersSorted()
    .filter((voter) => !voter.registrationEvent)
    .reduce(
      (counts, voter) => ({
        ...counts,
        [voter.party]: (counts[voter.party] ?? 0) + 1,
      }),
      // eslint-disable-next-line vx/gts-object-literal-types
      {} as Record<PartyAbbreviation, number>
    );
  const certificationPage = React.createElement(CertificationPage, {
    election,
    voterCountByParty,
    configuredPrecinct,
  });
  const certificationPdf = (
    await renderToPdf({
      document: certificationPage,
      landscape: true,
      marginDimensions: {
        ...marginDimensions,
        top: marginDimensions.bottom,
      },
    })
  ).unsafeUnwrap();

  // For now, split into two PDFs so users can parallelize printing. We want the
  // PDFs to be roughly equal in size.
  const numPdfChunks = 2;
  const groupVoterCounts = iter(voterGroups).map(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ([_, group]) => group.existingVoters.length
  );
  const chunks = splitIntoBalancedChunks(
    groupPdfs,
    groupVoterCounts.toArray(),
    numPdfChunks
  );
  // Attach the cover sheet to the first chunk and the certification page to the last
  const pdfs = await iter(chunks)
    .map((chunkPdfs, i) => {
      if (i === 0) {
        chunkPdfs.unshift(coverPdf);
      }
      if (i === numPdfChunks - 1) {
        chunkPdfs.push(certificationPdf);
      }
      return concatenatePdfs(chunkPdfs);
    })
    .toArray();
  return pdfs;
}

async function exportBackupVoterChecklist(
  workspace: LocalWorkspace,
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

  usbDriveStatus = await usbDrive.status();
  if (usbDriveStatus.status !== 'mounted') {
    console.log('No USB drive mounted, skipping export');
    return;
  }
  const pdfs = await getBackupPaperChecklistPdfs(workspace.store);

  const exporter = new Exporter({
    allowedExportPatterns: ['**'], // TODO restrict allowed export paths
    usbDrive,
  });
  for (const [i, pdf] of iter(pdfs).enumerate()) {
    const inProgressName = `part_${
      i + 1
    }_backup_voter_checklist.in_progress.pdf`;
    const inProgressPath = join(usbDriveStatus.mountPoint, inProgressName);
    const finalPath = join(
      usbDriveStatus.mountPoint,
      `part_${i + 1}_backup_voter_checklist.pdf`
    );
    (
      await exporter.exportDataToUsbDrive('', inProgressName, pdf, {
        machineDirectoryToWriteToFirst: workspace.assetDirectoryPath,
      })
    ).unsafeUnwrap();
    await move(inProgressPath, finalPath, { overwrite: true });
  }
  console.timeEnd('Exported backup voter checklist');
  await usbDrive.sync();
}

export function start({
  workspace,
  usbDrive,
}: {
  workspace: LocalWorkspace;
  usbDrive: UsbDrive;
}): void {
  console.log('Starting VxPollBook backup worker');
  process.nextTick(async () => {
    await exportBackupVoterChecklist(workspace, usbDrive);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of setInterval(BACKUP_INTERVAL)) {
      await exportBackupVoterChecklist(workspace, usbDrive);
    }
  });
}
