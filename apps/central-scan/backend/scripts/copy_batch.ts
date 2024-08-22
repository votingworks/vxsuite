import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { AcceptedSheet } from '@votingworks/backend';
import {
  assert,
  assertDefined,
  extractErrorMessage,
} from '@votingworks/basics';
import { Id, safeParseInt } from '@votingworks/types';

import { BaseLogger, LogSource } from '@votingworks/logging';
import { SCAN_WORKSPACE } from '../src/globals';
import { Store } from '../src/store';
import { createWorkspace } from '../src/util/workspace';

const usageMessage = `Usage: copy-batch '<batch-name>' <num-copies>

Arguments:
  <batch-name>\tThe name of the batch to copy
  <num-copies>\tThe number of copies to create`;

interface CopyBatchInput {
  batchName: string;
  numCopies: number;
}

function checkEnvironment(): void {
  assert(process.env.NODE_ENV !== 'production', 'Cannot be run in production');
}

function parseCommandLineArgs(args: readonly string[]): CopyBatchInput {
  const parseNumCopiesResult = safeParseInt(args[1]);
  if (args.length !== 2 || !parseNumCopiesResult.isOk()) {
    console.error(usageMessage);
    process.exit(1);
  }
  const batchName = args[0];
  const numCopies = parseNumCopiesResult.ok();
  return { batchName, numCopies };
}

function copySheet(store: Store, sheet: AcceptedSheet, newBatchId: Id): void {
  const newSheetId = uuid();
  const newSheet: AcceptedSheet = {
    ...sheet,
    id: newSheetId,
    batchId: newBatchId,
    frontImagePath: path.join(
      path.dirname(sheet.frontImagePath),
      `${newSheetId}-front.jpg`
    ),
    backImagePath: path.join(
      path.dirname(sheet.backImagePath),
      `${newSheetId}-back.jpg`
    ),
  };

  fs.copyFileSync(sheet.frontImagePath, newSheet.frontImagePath);
  fs.copyFileSync(sheet.backImagePath, newSheet.backImagePath);

  store.addSheet(newSheetId, newSheet.batchId, [
    {
      imagePath: newSheet.frontImagePath,
      interpretation: newSheet.interpretation[0],
    },
    {
      imagePath: newSheet.backImagePath,
      interpretation: newSheet.interpretation[1],
    },
  ]);
}

function getAcceptedSheetsInBatch(
  store: Store,
  batchName: string
): AcceptedSheet[] {
  const batches = store.getBatches();
  const batchId = assertDefined(
    batches.find((batch) => batch.label === batchName),
    `No batch named '${batchName}'`
  ).id;

  const sheetGenerator = store.forEachAcceptedSheet();
  const sheets: AcceptedSheet[] = [];
  for (const sheet of sheetGenerator) {
    if (sheet.batchId === batchId) {
      sheets.push(sheet);
    }
  }
  return sheets;
}

function copyBatch({ batchName, numCopies }: CopyBatchInput): void {
  const { store } = createWorkspace(
    assertDefined(SCAN_WORKSPACE),
    new BaseLogger(LogSource.VxDevelopmentScript)
  );

  const sheets = getAcceptedSheetsInBatch(store, batchName);

  for (let i = 0; i < numCopies; i += 1) {
    const newBatchId = store.addBatch();
    for (const sheet of sheets) {
      copySheet(store, sheet, newBatchId);
    }
    store.finishBatch({ batchId: newBatchId });
  }

  const copyOrCopies = numCopies === 1 ? 'copy' : 'copies';
  console.log(`✅ Created ${numCopies} ${copyOrCopies} of '${batchName}'`);
}

/**
 * A script for copying a scanner store's sheet records to facilitate scale testing
 */
export function main(args: readonly string[]): void {
  try {
    checkEnvironment();
    copyBatch(parseCommandLineArgs(args));
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
