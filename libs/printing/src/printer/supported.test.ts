import { expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { HmpbBallotPaperSize } from '@votingworks/types';
import {
  SUPPORTED_PRINTER_CONFIGS,
  getPpdPath,
  deriveM404Ppd,
  HP_4001_PRINTER_CONFIG,
  M404_INPUT_SLOT,
  HP_M404_PRINTER_CONFIG,
} from './supported';

// test also confirms that the configs.json file is valid
test('referenced PPD files exist and are valid', async () => {
  for (const config of SUPPORTED_PRINTER_CONFIGS) {
    const ppdContent = await readFile(getPpdPath(config), 'utf8');
    expect(ppdContent).toMatch(/PPD-Adobe:\s*"4\.3"/);
  }
});

// The slot name is registered in the PPD by deriveM404Ppd and selected at print
// time from the printer's config. Those are separate declarations of the same
// string: if they drift, CUPS silently drops the unknown choice and the M404
// goes back to prompting the operator to confirm the tray.
test('M404 config selects the input slot its PPD registers', () => {
  expect(HP_M404_PRINTER_CONFIG.inputSlot).toEqual(M404_INPUT_SLOT);
});

test('M404 PPD stays in sync with the generic PPD (run `pnpm generate-m404-ppd` if this fails)', async () => {
  const genericPpd = await readFile(getPpdPath(HP_4001_PRINTER_CONFIG), 'utf8');
  const m404Ppd = await readFile(getPpdPath(HP_M404_PRINTER_CONFIG), 'utf8');
  expect(m404Ppd).toEqual(deriveM404Ppd(genericPpd));
});

// The laser printers print hand-marked paper ballots, so their PPDs must define
// every ballot paper size. CUPS resolves the `media` option against PPD page
// size names case-insensitively, and a name with no PPD entry silently falls
// back to the PPD default rather than failing.
test.each([
  ['generic', HP_4001_PRINTER_CONFIG],
  ['M404', HP_M404_PRINTER_CONFIG],
])('%s PPD defines every ballot paper size', async (_label, printerConfig) => {
  const ppdContent = await readFile(getPpdPath(printerConfig), 'utf8');

  for (const keyword of [
    'PageSize',
    'PageRegion',
    'ImageableArea',
    'PaperDimension',
  ]) {
    const definedSizes = [
      ...ppdContent.matchAll(
        new RegExp(String.raw`^\*${keyword}\s+(\S+?)/`, 'gm')
      ),
    ].map(([, name]) => name.toLowerCase());

    for (const paperSize of Object.values(HmpbBallotPaperSize)) {
      expect(definedSizes, `${keyword} is missing ${paperSize}`).toContain(
        paperSize.toLowerCase()
      );
    }
  }
});
