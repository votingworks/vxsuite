import { tmpNameSync } from 'tmp';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { PDFDocument, rgb } from 'pdf-lib';
import { assert } from '@votingworks/basics';
import { safeParseInt } from '@votingworks/types';
import { normalizePdf } from './normalize_pdf';

/**
 * Given a PDF document, convert it to grayscale.
 */
export async function convertPdfToGrayscale(
  pdf: Uint8Array
): Promise<Uint8Array> {
  const tmpPdfFilePath = tmpNameSync();
  await writeFile(tmpPdfFilePath, pdf);
  const tmpGrayscalePdfFilePath = tmpNameSync();
  await promisify(execFile)('gs', [
    `-sOutputFile=${tmpGrayscalePdfFilePath}`,
    '-sDEVICE=pdfwrite',
    '-sColorConversionStrategy=Gray',
    '-dProcessColorModel=/DeviceGray',
    '-dNOPAUSE',
    '-dBATCH',
    tmpPdfFilePath,
  ]);
  try {
    return normalizePdf(await readFile(tmpGrayscalePdfFilePath));
  } finally {
    await rm(tmpGrayscalePdfFilePath);
    await rm(tmpPdfFilePath);
  }
}

/**
 * Given a PDF document, convert it to CMYK.
 */
export async function convertPdfToCmyk(pdf: Uint8Array): Promise<Uint8Array> {
  const tmpPdfFilePath = tmpNameSync();
  await writeFile(tmpPdfFilePath, pdf);
  const tmpCmykPdfFilePath = tmpNameSync();
  await promisify(execFile)('gs', [
    `-sOutputFile=${tmpCmykPdfFilePath}`,
    '-sDEVICE=pdfwrite',
    '-sColorConversionStrategy=CMYK',
    '-sColorConversionStrategyForImages=CMYK',
    '-dProcessColorModel=/DeviceCMYK',
    '-dNOPAUSE',
    '-dBATCH',
    tmpPdfFilePath,
  ]);
  try {
    return normalizePdf(await readFile(tmpCmykPdfFilePath));
  } finally {
    await rm(tmpCmykPdfFilePath);
    await rm(tmpPdfFilePath);
  }
}

/**
 * A named spot (separation) ink for two-ink ballot printing.
 */
export interface SpotColor {
  /**
   * The separation/ink name as it should appear in the PDF and to the
   * printer's RIP, e.g. `'PMS 293'`.
   */
  readonly name: string;
  /**
   * The RGB fill color (each channel 0–1) in the source PDF that this ink
   * replaces, i.e. the tint the ballot template renders the party color as.
   */
  readonly sourceRgb: readonly [number, number, number];
  /**
   * DeviceCMYK values (each 0–1) of the ink at full strength. Used as the
   * separation's alternate colorspace so the composite still previews in color
   * even though only the named plate is printed.
   */
  readonly alternateCmyk: readonly [number, number, number, number];
}

/**
 * Encodes a string as a PDF name, escaping any non-alphanumeric character as
 * `#XX` per the PDF spec (e.g. `'PMS 293'` -> `'PMS#20293'`).
 */
function encodePdfName(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, (char) => {
    const hex = char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
    return `#${hex}`;
  });
}

/**
 * Recomputes the indirect `/Length` of every content stream we rewrote
 * (identified by the injected `/Spot` operator). Ghostscript counts the byte
 * length up to `endstream`, including the EOL that precedes it.
 */
function fixEditedStreamLengths(pdf: string): string {
  let result = pdf;
  const streamRegex = /<<\/Length (\d+) 0 R>>\nstream\n/g;
  let match = streamRegex.exec(pdf);
  while (match) {
    const dataStart = streamRegex.lastIndex;
    const dataEnd = pdf.indexOf('endstream', dataStart);
    if (pdf.slice(dataStart, dataEnd).includes('/Spot')) {
      const lengthObjNum = match[1];
      result = result.replace(
        new RegExp(`\\n${lengthObjNum} 0 obj\\n\\d+\\nendobj`),
        `\n${lengthObjNum} 0 obj\n${dataEnd - dataStart}\nendobj`
      );
    }
    match = streamRegex.exec(pdf);
  }
  return result;
}

/**
 * Rewrites a grayscale PDF so the party-tint gray (`tint`) becomes a named spot
 * separation printed at 100%, leaving all other grays (text, rules, table
 * shading) on the black plate. The separation's tint transform bakes in the
 * light party color as its DeviceCMYK alternate, so the composite still
 * previews in color.
 */
function substituteSpotColor(
  grayscalePdf: string,
  tint: string,
  spot: SpotColor
): string {
  const escapedTint = tint.replace(/\./g, '\\.');
  assert(
    new RegExp(`^${escapedTint} [gG]$`, 'm').test(grayscalePdf),
    `party-tint gray ${tint} not found in grayscale PDF`
  );

  // Append the tint-transform function object, numbered past the current max;
  // normalizePdf rebuilds the xref afterward.
  const objNums = [...grayscalePdf.matchAll(/^(\d+) 0 obj/gm)].map((m) =>
    safeParseInt(m[1]).unsafeUnwrap()
  );
  const functionObjNum = Math.max(...objNums) + 1;
  const functionObj =
    `${functionObjNum} 0 obj\n` +
    `<</FunctionType 2/Domain[0 1]/C0[0 0 0 0]` +
    `/C1[${spot.alternateCmyk.join(' ')}]/N 1` +
    `/Range[0 1 0 1 0 1 0 1]>>\nendobj\n`;
  let result = grayscalePdf.replace(/\nxref\n/, `\n${functionObj}xref\n`);

  // Add the separation colorspace to every page's resources.
  const separation = `[/Separation/${encodePdfName(
    spot.name
  )}/DeviceCMYK ${functionObjNum} 0 R]`;
  result = result.replaceAll(
    '/Resources<<',
    `/Resources<</ColorSpace<</Spot ${separation}>>`
  );

  // Rewrite the tint fill/stroke to 100% of the spot separation.
  result = result
    .replace(new RegExp(`^${escapedTint} g$`, 'gm'), '/Spot cs 1 scn')
    .replace(new RegExp(`^${escapedTint} G$`, 'gm'), '/Spot CS 1 SCN');

  return fixEditedStreamLengths(result);
}

/**
 * Converts a PDF to grayscale via Ghostscript, leaving streams uncompressed so
 * that color operators can be rewritten as text.
 */
async function ghostscriptGrayscale(pdf: Uint8Array): Promise<string> {
  const tmpPdfFilePath = tmpNameSync();
  await writeFile(tmpPdfFilePath, pdf);
  const tmpGrayscalePdfFilePath = tmpNameSync();
  await promisify(execFile)('gs', [
    `-sOutputFile=${tmpGrayscalePdfFilePath}`,
    '-sDEVICE=pdfwrite',
    '-sColorConversionStrategy=Gray',
    '-dProcessColorModel=/DeviceGray',
    '-dCompressPages=false',
    '-dCompressStreams=false',
    '-dNOPAUSE',
    '-dBATCH',
    tmpPdfFilePath,
  ]);
  try {
    return (await readFile(tmpGrayscalePdfFilePath)).toString('latin1');
  } finally {
    await rm(tmpGrayscalePdfFilePath);
    await rm(tmpPdfFilePath);
  }
}

const tintGrayscaleValueCache = new Map<string, string>();

/**
 * The grayscale value (a PDF `g` operand) that the grayscale pass produces for
 * a given RGB color. Determined empirically by grayscaling a swatch so it
 * matches Ghostscript's conversion exactly, then memoized.
 */
async function tintGrayscaleValue(
  sourceRgb: readonly [number, number, number]
): Promise<string> {
  const key = sourceRgb.join(',');
  const cached = tintGrayscaleValueCache.get(key);
  if (cached !== undefined) return cached;

  const swatch = await PDFDocument.create();
  swatch.addPage([10, 10]).drawRectangle({
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    color: rgb(...sourceRgb),
  });
  const grayscale = await ghostscriptGrayscale(await swatch.save());
  const value = [...grayscale.matchAll(/^([\d.]+) g$/gm)]
    .map((m) => m[1])
    .find((v) => v !== '0' && v !== '1');
  assert(value !== undefined, 'could not determine grayscale value of tint');

  tintGrayscaleValueCache.set(key, value);
  return value;
}

/**
 * Converts a color ballot PDF into a two-ink PDF for spot-color printing: the
 * party tint (`spot.sourceRgb`) prints on a single named spot plate and
 * everything else (text, rules, table shading, logos) prints on a single black
 * plate.
 */
export async function convertPdfToSpotColor(
  pdf: Uint8Array,
  spot: SpotColor
): Promise<Uint8Array> {
  // Grayscale pass collapses black, white, table shading, and raster logos onto
  // a single ink; the party tint becomes a specific gray we then swap for the
  // spot separation.
  const [tint, grayscalePdf] = await Promise.all([
    tintGrayscaleValue(spot.sourceRgb),
    ghostscriptGrayscale(pdf),
  ]);
  return normalizePdf(
    Buffer.from(substituteSpotColor(grayscalePdf, tint, spot), 'latin1')
  );
}
