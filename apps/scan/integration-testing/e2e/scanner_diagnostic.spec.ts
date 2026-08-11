import { test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  forceLogOutAndResetElectionDefinition,
  logInAsSystemAdministrator,
} from './support/auth.js';
import { mockPdiScannerHandler } from './support/scanner.js';
import {
  makeBlankSheetPdf,
  makeStreakedSheetPdf,
} from './support/synthesized_pdfs.js';

// Regression test for the v4.1.0 diagnostics-menu scan bug: the PDI scanner
// client emits grayscale images, and the diagnostic previously routed them
// through node-canvas, which reads four bytes per pixel unconditionally —
// yielding garbage pixels ("Test Scan Failed" on a blank sheet) or a backend
// crash. The mock scanner now emits grayscale like the real client, so this
// exercises the fixed path end to end.
test('scanner diagnostic passes on a blank sheet and fails on a streaked sheet', async ({
  page,
}) => {
  const pdfDir = mkdtempSync(join(tmpdir(), 'scan-diagnostic-'));
  const blankSheetPdfPath = join(pdfDir, 'blank-sheet.pdf');
  writeFileSync(blankSheetPdfPath, makeBlankSheetPdf());
  const streakedSheetPdfPath = join(pdfDir, 'streaked-sheet.pdf');
  writeFileSync(streakedSheetPdfPath, makeStreakedSheetPdf());

  mockPdiScannerHandler.cleanup();
  await forceLogOutAndResetElectionDefinition(page);
  await page
    .getByText('Insert an election manager card to configure VxScan')
    .waitFor();

  await logInAsSystemAdministrator(page);
  await page.getByRole('button', { name: 'Diagnostics' }).click();

  // A blank sheet scans as blank: the diagnostic passes.
  await page.getByRole('button', { name: 'Perform Test Scan' }).click();
  await page.getByText('Insert a blank sheet into the scanner.').waitFor();
  await page.waitForTimeout(1_000); // let the instruction screen register on video
  mockPdiScannerHandler.insertSheet(blankSheetPdfPath);
  await page.getByText('Test Scan Successful').waitFor();
  await page.waitForTimeout(2_000);
  mockPdiScannerHandler.removeSheet();
  await page.getByRole('button', { name: 'Close' }).click();

  // A streaked sheet scans as not blank: the diagnostic still catches real
  // failures rather than passing unconditionally.
  await page.getByRole('button', { name: 'Perform Test Scan' }).click();
  await page.getByText('Insert a blank sheet into the scanner.').waitFor();
  await page.waitForTimeout(1_000);
  mockPdiScannerHandler.insertSheet(streakedSheetPdfPath);
  await page.getByText('Test Scan Failed').waitFor();
  await page.waitForTimeout(2_000);
  mockPdiScannerHandler.removeSheet();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByText('Diagnostics').first().waitFor();
  mockPdiScannerHandler.cleanup();
});
