import { expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { HmpbBallotPaperSize } from '@votingworks/types';
import {
  SUPPORTED_PRINTER_CONFIGS,
  getPpdPath,
  deriveM404nPpd,
  HP_LASER_PRINTER_CONFIG,
  M404N_PRINTER_CONFIG,
} from './supported';

// test also confirms that the configs.json file is valid
test('referenced PPD files exist and are valid', async () => {
  for (const config of SUPPORTED_PRINTER_CONFIGS) {
    const ppdContent = await readFile(getPpdPath(config), 'utf8');
    expect(ppdContent).toMatch(/PPD-Adobe:\s*"4\.3"/);
  }
});

test('M404n PPD stays in sync with the generic PPD (run `pnpm generate-m404n-ppd` if this fails)', async () => {
  const genericPpd = await readFile(
    getPpdPath(HP_LASER_PRINTER_CONFIG),
    'utf8'
  );
  const m404nPpd = await readFile(getPpdPath(M404N_PRINTER_CONFIG), 'utf8');
  expect(m404nPpd).toEqual(deriveM404nPpd(genericPpd));
});

// The laser printers print hand-marked paper ballots, so their PPDs must define
// every ballot paper size. CUPS resolves the `media` option against PPD page
// size names case-insensitively, and a name with no PPD entry silently falls
// back to the PPD default rather than failing.
test.each([
  ['generic', HP_LASER_PRINTER_CONFIG],
  ['M404n', M404N_PRINTER_CONFIG],
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
