import * as fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpNameSync } from 'tmp';
import {
  decodePDFRawStream,
  PDFArray,
  PDFDocument,
  PDFName,
  PDFRawStream,
  rgb,
  StandardFonts,
} from 'pdf-lib';
import { assert, assertDefined } from '@votingworks/basics';
import { makeTemporaryFile } from '@votingworks/fixtures';
import {
  convertPdfFileToGrayscale,
  convertPdfToGrayscale,
  convertPdfToSpotColor,
  SpotColor,
} from './pdf_conversion.js';
import { fixturesDir } from './ballot_fixtures.js';
import { Colors } from './ballot_components.js';
import {
  ColorTints,
  NhStateSpotColors,
} from './ballot_templates/nh_state_primary_ballot_template.js';

const PMS_293 = NhStateSpotColors.BLUE;

const BLACK = '#000000';
const WHITE = '#FFFFFF';
const GRAY_SHADE = Colors.DARKER_GRAY;

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

/**
 * Builds a PDF with one page per argument, each drawing a filled rectangle for
 * every hex color given.
 */
async function buildColorPdf(...pages: Array<string[]>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const colors of pages) {
    const page = doc.addPage([200, 200]);
    for (const [i, color] of colors.entries()) {
      page.drawRectangle({
        x: 10,
        y: 10 + i * 20,
        width: 100,
        height: 15,
        color: rgb(...hexToRgb(color)),
      });
    }
  }
  return doc.save();
}

/**
 * The concatenated, decoded content streams of every page in a PDF.
 */
async function decodedContents(pdf: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  return doc
    .getPages()
    .map((page) => {
      const contents = doc.context.lookup(
        page.node.get(PDFName.of('Contents'))
      );
      const streams =
        contents instanceof PDFArray
          ? contents.asArray().map((ref) => doc.context.lookup(ref))
          : [contents];
      return streams
        .map((stream) => {
          assert(stream instanceof PDFRawStream);
          return Buffer.from(
            stream.dict.has(PDFName.of('Filter'))
              ? decodePDFRawStream(stream).decode()
              : stream.contents
          ).toString('latin1');
        })
        .join('\n');
    })
    .join('\n');
}

describe('convertPdfToSpotColor', () => {
  test('replaces the party tint with a named spot separation', async () => {
    // Page 2 has no tint, exercising the untouched-content-stream path.
    const pdf = await buildColorPdf([ColorTints.BLUE, BLACK, WHITE], [BLACK]);

    const converted = await convertPdfBufferToSpotColor(
      pdf,
      Object.values(NhStateSpotColors)
    );

    const result = Buffer.from(converted).toString('latin1');
    // The named separation's alternate colorspace previews the tint as the
    // exact source color (#8FD0F1), so the converted PDF looks like the
    // source on screen.
    expect(result).toContain('/Separation /PMS#20293 /DeviceRGB');
    expect(result).toContain('/C1 [ 0.5608 0.8157 0.9451 ]');
    // No color operators remain in the page content: black/white/tint are all
    // expressed as grays or the spot separation.
    expect(await decodedContents(converted)).not.toMatch(/ (rg|RG)\b/);
  });

  test('converts a stroked tint to a spot stroke', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    page.drawRectangle({
      x: 10,
      y: 10,
      width: 100,
      height: 100,
      borderColor: rgb(...hexToRgb(ColorTints.BLUE)),
      borderWidth: 3,
    });
    const converted = await convertPdfBufferToSpotColor(
      await doc.save(),
      Object.values(NhStateSpotColors)
    );
    expect(await decodedContents(converted)).toContain('/Spot0 CS 1 SCN');
  });

  test('produces a single named spot plate plus black', async () => {
    const pdf = await buildColorPdf([ColorTints.BLUE, BLACK]);
    const converted = await convertPdfBufferToSpotColor(
      pdf,
      Object.values(NhStateSpotColors)
    );

    // Render one separation plate per ink via Ghostscript's tiffsep device.
    // -dPDFSTOPONERROR makes structural errors (bad xref/stream lengths) fail
    // instead of being silently repaired, so this also validates the PDF's
    // structure.
    const inputPath = tmpNameSync();
    const outDir = tmpNameSync();
    try {
      await mkdir(outDir, { recursive: true });
      await writeFile(inputPath, converted);
      await promisify(execFile)('gs', [
        '-q',
        '-dNOPAUSE',
        '-dBATCH',
        '-dPDFSTOPONERROR',
        '-sDEVICE=tiffsep',
        '-r72',
        `-sOutputFile=${outDir}/plate_%d.tif`,
        inputPath,
      ]);
      const plates = await readdir(outDir);
      // The spot ink gets its own named plate. (tiffsep always emits the CMYK
      // process plates too — test 1 asserts no process color is actually used.)
      expect(plates).toContain('plate_1(PMS 293).tif');
      expect(plates).toContain('plate_1(Black).tif');
    } finally {
      await rm(inputPath, { force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  test('throws when more than one party tint is present', async () => {
    // A two-ink job has exactly one spot plate; a document with both party
    // tints is unconditionally a bug.
    const pdf = await buildColorPdf([ColorTints.BLUE, BLACK], [ColorTints.RED]);
    await expect(
      convertPdfBufferToSpotColor(pdf, Object.values(NhStateSpotColors))
    ).rejects.toThrow(/at most one spot color/);
  });

  test('converts only the party tint, leaving other grays on the black plate', async () => {
    // Like a Return of Votes form: a party tint plus a gray design shade.
    const pdf = await buildColorPdf([ColorTints.BLUE, GRAY_SHADE, BLACK]);
    const converted = await convertPdfBufferToSpotColor(
      pdf,
      Object.values(NhStateSpotColors)
    );

    const contents = await decodedContents(converted);
    // The party tint became the spot separation...
    expect(contents).toContain('/Spot0 cs 1 scn');
    // ...while the gray design shade stayed an ordinary gray fill (not spot).
    const remainingGrays = [...contents.matchAll(/([\d.]+) g\b/g)]
      .map((m) => m[1])
      .filter((v) => v !== '0' && v !== '1');
    expect(remainingGrays).toHaveLength(1);
  });

  test('applies no ink when no source color is present', async () => {
    const noTint = await buildColorPdf([BLACK, WHITE, GRAY_SHADE]);
    const converted = await convertPdfBufferToSpotColor(
      noTint,
      Object.values(NhStateSpotColors)
    );
    expect(Buffer.from(converted).toString('latin1')).not.toContain(
      '/Separation'
    );
  });

  test('ignores tint-like text inside string literals', async () => {
    // Text that happens to spell a tint operator must stay text, not become a
    // spot fill.
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([200, 200]);
    page.drawText(`${PMS_293.grayscaleTint} g`, { x: 20, y: 150, font });
    page.drawRectangle({
      x: 10,
      y: 10,
      width: 100,
      height: 15,
      color: rgb(...hexToRgb(ColorTints.BLUE)),
    });
    const converted = await convertPdfBufferToSpotColor(
      await doc.save(),
      Object.values(NhStateSpotColors)
    );
    // Exactly one substitution: the rectangle fill, not the text.
    const contents = await decodedContents(converted);
    expect(contents.match(/\/Spot0 cs 1 scn/g)).toHaveLength(1);
  });

  // The fixture ballots are real Chromium-rendered output, so these tests
  // guard the whole pipeline: a rendering or Ghostscript change that shifts a
  // tint's grayscale value would otherwise silently drop the party plate
  // (converting to plain grayscale is a legitimate outcome for nonpartisan
  // ballots, so nothing else would catch it).
  test('converts a real rendered partisan ballot to its party plate', async () => {
    const ballot = await readFile(
      join(fixturesDir, 'nh-state-primary-election/dem-blank-ballot.pdf')
    );
    const converted = await convertPdfBufferToSpotColor(
      ballot,
      Object.values(NhStateSpotColors)
    );
    expect(Buffer.from(converted).toString('latin1')).toContain(
      '/Separation /PMS#20293'
    );
  });

  test('converts a real rendered nonpartisan ballot to plain grayscale', async () => {
    const ballot = await readFile(
      join(fixturesDir, 'nh-state-general-election/blank-ballot.pdf')
    );
    const converted = await convertPdfBufferToSpotColor(
      ballot,
      Object.values(NhStateSpotColors)
    );
    expect(Buffer.from(converted).toString('latin1')).not.toContain(
      '/Separation'
    );
  });
});

describe('NH spot color declarations', () => {
  /**
   * The gray that Ghostscript's grayscale conversion actually produces for a
   * hex color, discovered by converting a single-color swatch.
   */
  async function actualGrayscaleValue(hex: string): Promise<string> {
    const swatch = await buildColorPdf([hex]);
    const grayscale = await convertPdfToGrayscale(swatch);
    const values = [
      ...(await decodedContents(grayscale)).matchAll(/([\d.]+) g\b/g),
    ]
      .map((m) => m[1])
      .filter((v) => v !== '0' && v !== '1');
    return assertDefined(values[0]);
  }

  test('declared grayscaleTint values match the actual conversion', async () => {
    for (const spot of Object.values(NhStateSpotColors)) {
      expect
        .soft(await actualGrayscaleValue(spot.sourceColor), spot.name)
        .toEqual(spot.grayscaleTint);
    }
  });

  test('no other template palette color collides with a spot tint', async () => {
    // If a palette color grayscales to the same value as a party tint, the
    // conversion would silently print it on the party plate. The palette is
    // the closed set of colors the templates draw with.
    const palette: Record<string, string> = {
      ...Colors,
      TINT_GRAY: ColorTints.GRAY,
    };
    const declaredTints = new Set(
      Object.values(NhStateSpotColors).map((spot) => spot.grayscaleTint)
    );
    for (const [name, hex] of Object.entries(palette)) {
      if (hex === '#000000' || hex === '#FFFFFF') continue;
      expect
        .soft(declaredTints.has(await actualGrayscaleValue(hex)), name)
        .toEqual(false);
    }
  });
});

test('convertPdfFileToGrayscale/convertPdfToGrayscale parity smoke test', async () => {
  const pdf = await buildColorPdf([ColorTints.RED]);
  const pdfPath = makeTemporaryFile({ content: pdf });

  await convertPdfFileToGrayscale(pdfPath);
  const result = fs.readFileSync(pdfPath);
  expect(result).toEqual(await convertPdfToGrayscale(pdf));
});

async function convertPdfBufferToSpotColor(
  pdf: Uint8Array,
  spotColors: SpotColor[]
) {
  const pdfPath = makeTemporaryFile({ content: pdf });
  await convertPdfToSpotColor({ pdfPath, spotColors });

  return fs.readFileSync(pdfPath);
}
