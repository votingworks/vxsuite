import { describe, expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpNameSync } from 'tmp';
import { PDFDocument, rgb } from 'pdf-lib';
import { assert } from '@votingworks/basics';
import { safeParseInt } from '@votingworks/types';
import { convertPdfToSpotColor, SpotColor } from './pdf_conversion';

const BLUE_TINT: [number, number, number] = [143 / 255, 208 / 255, 241 / 255];
const GRAY_SHADE: [number, number, number] = [176 / 255, 176 / 255, 176 / 255];
const BLACK: [number, number, number] = [0, 0, 0];
const WHITE: [number, number, number] = [1, 1, 1];

const PMS_293: SpotColor = {
  name: 'PMS 293',
  sourceRgb: BLUE_TINT,
  alternateCmyk: [0.45, 0.01, 0.01, 0],
};

/**
 * Builds a PDF with one page per argument, each drawing a filled rectangle for
 * every color given.
 */
async function buildColorPdf(
  ...pages: Array<Array<[number, number, number]>>
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const colors of pages) {
    const page = doc.addPage([200, 200]);
    for (const [i, [r, g, b]] of colors.entries()) {
      page.drawRectangle({
        x: 10,
        y: 10 + i * 20,
        width: 100,
        height: 15,
        color: rgb(r, g, b),
      });
    }
  }
  return doc.save();
}

describe('convertPdfToSpotColor', () => {
  test('replaces the party tint with a named spot separation', async () => {
    // Page 2 has no tint, exercising the untouched-content-stream path.
    const pdf = await buildColorPdf([BLUE_TINT, BLACK, WHITE], [BLACK]);

    const result = Buffer.from(
      await convertPdfToSpotColor(pdf, PMS_293)
    ).toString('latin1');

    // The named separation is defined with a DeviceCMYK alternate whose tint
    // transform bakes in the light party color (so the composite previews it).
    expect(result).toContain('/Separation/PMS#20293/DeviceCMYK');
    expect(result).toContain('/C1[0.45 0.01 0.01 0]');
    // The tint is painted at 100% of the separation, as a fill.
    expect(result).toContain('/Spot cs 1 scn');
    // No process color remains: black/white/tint are all off the RGB plates.
    expect(result).not.toMatch(/\bDeviceRGB\b/);
    expect(result).not.toMatch(/[\d.]+ [\d.]+ [\d.]+ (rg|RG)\b/);

    // The rewritten content stream's indirect /Length must match its actual
    // byte count (Ghostscript counts up to `endstream`), so strict PDF readers
    // accept it.
    const editedStream = [
      ...result.matchAll(/<<\/Length (\d+) 0 R>>\nstream\n/g),
    ].find((match) => {
      const start = match.index + match[0].length;
      return result
        .slice(start, result.indexOf('endstream', start))
        .includes('/Spot');
    });
    assert(editedStream !== undefined);
    const dataStart = editedStream.index + editedStream[0].length;
    const declaredLength = new RegExp(
      `\\n${editedStream[1]} 0 obj\\n(\\d+)\\nendobj`
    ).exec(result);
    assert(declaredLength !== null);
    expect(safeParseInt(declaredLength[1]).unsafeUnwrap()).toEqual(
      result.indexOf('endstream', dataStart) - dataStart
    );
  });

  test('converts a stroked tint to a spot stroke', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    page.drawRectangle({
      x: 10,
      y: 10,
      width: 100,
      height: 100,
      borderColor: rgb(...BLUE_TINT),
      borderWidth: 3,
    });
    const result = Buffer.from(
      await convertPdfToSpotColor(await doc.save(), PMS_293)
    ).toString('latin1');

    expect(result).toContain('/Spot CS 1 SCN');
  });

  test('produces a single named spot plate plus black (no CMY ink)', async () => {
    const pdf = await buildColorPdf([BLUE_TINT, BLACK]);
    const result = await convertPdfToSpotColor(pdf, PMS_293);

    // Render one separation plate per ink via Ghostscript's tiffsep device.
    const inputPath = tmpNameSync();
    const outDir = tmpNameSync();
    await mkdir(outDir, { recursive: true });
    await writeFile(inputPath, result);
    await promisify(execFile)('gs', [
      '-q',
      '-dNOPAUSE',
      '-dBATCH',
      '-sDEVICE=tiffsep',
      '-r72',
      `-sOutputFile=${outDir}/plate_%d.tif`,
      inputPath,
    ]);
    const plates = await readdir(outDir);
    try {
      // The spot ink gets its own named plate; C/M/Y do not (nothing uses them).
      expect(plates).toContain('plate_1(PMS 293).tif');
      expect(plates).toContain('plate_1(Black).tif');
    } finally {
      await rm(inputPath);
      await rm(outDir, { recursive: true });
    }
  });

  test('converts only the party tint, leaving other grays on the black plate', async () => {
    // Like a Return of Votes form: a party tint plus a gray design shade.
    const pdf = await buildColorPdf([BLUE_TINT, GRAY_SHADE, BLACK]);
    const result = Buffer.from(
      await convertPdfToSpotColor(pdf, PMS_293)
    ).toString('latin1');

    // The party tint became the spot separation...
    expect(result).toContain('/Spot cs 1 scn');
    // ...while the gray design shade stayed an ordinary gray fill (not spot).
    const remainingGrays = [...result.matchAll(/^([\d.]+) g$/gm)]
      .map((m) => m[1])
      .filter((v) => v !== '0' && v !== '1');
    expect(remainingGrays).toHaveLength(1);
  });

  test('throws when the party tint is absent', async () => {
    const noTint = await buildColorPdf([BLACK, WHITE]);
    await expect(convertPdfToSpotColor(noTint, PMS_293)).rejects.toThrow(
      /not found/
    );
  });
});
