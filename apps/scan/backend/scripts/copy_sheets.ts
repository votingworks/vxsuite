import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { AcceptedSheet } from '@votingworks/backend';
import {
  assert,
  assertDefined,
  extractErrorMessage,
} from '@votingworks/basics';
import { safeParseNumber } from '@votingworks/types';

import { SCAN_WORKSPACE } from '../src/globals';
import { Store } from '../src/store';
import { createWorkspace } from '../src/util/workspace';

const usageMessage = `Usage: copy-sheets <target-sheet-count>

Arguments:
  <target-sheet-count>\tThe target total sheet count after copying`;

interface CopySheetsInput {
  targetSheetCount: number;
}

function checkEnvironment(): void {
  assert(process.env.NODE_ENV !== 'production', 'Cannot be run in production');
}

function parseCommandLineArgs(args: readonly string[]): CopySheetsInput {
  if (args.length !== 1 || !safeParseNumber(args[0]).isOk()) {
    console.log(usageMessage);
    process.exit(0);
  }
  const targetSheetCount = safeParseNumber(args[0]).unsafeUnwrap();
  return { targetSheetCount };
}

function copySheet(store: Store, sheet: AcceptedSheet): void {
  const newSheetId = uuid();
  const newSheet: AcceptedSheet = {
    ...sheet,
    id: newSheetId,
    frontImagePath: sheet.frontImagePath.replace(sheet.id, newSheetId),
    backImagePath: sheet.backImagePath.replace(sheet.id, newSheetId),
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

function copySheets({ targetSheetCount }: CopySheetsInput): void {
  const { store } = createWorkspace(assertDefined(SCAN_WORKSPACE));

  const currentSheetCount = store.getBallotsCounted();
  assert(
    currentSheetCount > 0,
    'Scanner store should contain at least one sheet to copy'
  );
  assert(
    targetSheetCount > currentSheetCount,
    `Target sheet count should be greater than current sheet count (${currentSheetCount})`
  );
  const numSheetsToCreate = targetSheetCount - currentSheetCount;

  const maxNumSheetsToReadForCopying = Math.min(
    numSheetsToCreate,
    500 // A cap to limit how much data the script loads
  );
  const sheetGenerator = store.forEachAcceptedSheet();
  const sheets: AcceptedSheet[] = [];
  let i = 0;
  for (const sheet of sheetGenerator) {
    sheets.push(sheet);
    i += 1;
    if (i === maxNumSheetsToReadForCopying) {
      break;
    }
  }

  for (i = 0; i < numSheetsToCreate; i += 1) {
    const sheet = sheets[i % sheets.length];
    copySheet(store, sheet);
  }

  console.log(
    `✅ Created ${numSheetsToCreate} new sheets by copying existing sheets, ` +
      `bringing total sheet count to ${targetSheetCount}`
  );
}

/**
 * A script for copying a scanner store's sheet records to facilitate scale testing
 */
export function main(args: readonly string[]): void {
  try {
    checkEnvironment();
    copySheets(parseCommandLineArgs(args));
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
