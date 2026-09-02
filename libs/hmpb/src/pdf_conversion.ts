import { tmpNameSync } from 'tmp';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import {
  decodePDFRawStream,
  PDFArray,
  PDFContext,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
} from 'pdf-lib';
import { assert } from '@votingworks/basics';
import { normalizePdf, normalizePdfFile } from './normalize_pdf.js';

/**
 * Converts a PDF to grayscale via Ghostscript, without normalizing the output.
 */
async function ghostscriptGrayscale(pdf: Uint8Array): Promise<Buffer> {
  const tmpPdfFilePath = tmpNameSync();
  await writeFile(tmpPdfFilePath, pdf);

  try {
    await ghostscriptGrayscaleFile(tmpPdfFilePath);
    return await readFile(tmpPdfFilePath);
  } finally {
    await rm(tmpPdfFilePath);
  }
}

/**
 * Converts the PDF at the given path to grayscale via Ghostscript, replacing
 * the original file iff successful.
 */
async function ghostscriptGrayscaleFile(pdfPath: string): Promise<void> {
  const outputPath = tmpNameSync();

  try {
    await promisify(execFile)('gs', [
      `-sOutputFile=${outputPath}`,
      '-sDEVICE=pdfwrite',
      '-sColorConversionStrategy=Gray',
      '-dProcessColorModel=/DeviceGray',
      '-dNOPAUSE',
      '-dBATCH',
      pdfPath,
    ]);

    await rename(outputPath, pdfPath);
  } finally {
    await rm(outputPath, { force: true });
  }
}

/**
 * Given a PDF document, convert it to grayscale.
 */
export async function convertPdfToGrayscale(
  pdf: Uint8Array
): Promise<Uint8Array> {
  return normalizePdf(await ghostscriptGrayscale(pdf));
}

/**
 * Converts the PDF at the given path to grayscale, replacing the original file.
 *
 * NOTE: Non-atomic - assumes usage with scratch files. Errors during conversion
 * may leave the file in an undefined state.
 */
export async function convertPdfFileToGrayscale(
  pdfPath: string
): Promise<void> {
  await ghostscriptGrayscaleFile(pdfPath);
  await normalizePdfFile(pdfPath);
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
 * A rule mapping a color that a ballot template renders onto a named spot
 * (separation) ink for spot-color printing.
 */
export interface SpotColor {
  /**
   * The separation/ink name as it should appear in the PDF and to the
   * printer's RIP, e.g. `'PMS 293'`.
   */
  readonly name: string;
  /**
   * The ballot template color this ink replaces, as a hex string (e.g.
   * `'#8FD0F1'`). Also used as the separation's alternate color, so the
   * converted PDF previews on screen exactly like the source.
   */
  readonly sourceColor: string;
  /**
   * The DeviceGray operand that Ghostscript's grayscale conversion produces
   * for `sourceColor`, e.g. `'0.776'`.
   */
  readonly grayscaleTint: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  assert(match !== null, `invalid hex color: ${hex}`);
  return [match[1], match[2], match[3]].map(
    (channel) => Math.round((parseInt(channel, 16) / 255) * 10000) / 10000
  ) as [number, number, number];
}

/**
 * Splits a content stream into segments alternating between operator text and
 * literal strings (`(...)`, with backslash escapes and nested parens). We only
 * want to do string replacements on operator text, not on string literals.
 */
function splitContentStreamOnOperators(
  content: string
): Array<{ text: string; isOperator: boolean }> {
  const segments: Array<{ text: string; isOperator: boolean }> = [];
  let segmentStart = 0;
  let depth = 0;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (depth > 0 && char === '\\') {
      i += 1;
    } else if (char === '(') {
      // @coverage-defer
      if (depth === 0) {
        segments.push({
          text: content.slice(segmentStart, i),
          isOperator: true,
        });
        segmentStart = i;
      }
      depth += 1;
    } else if (char === ')' && depth > 0) {
      depth -= 1;
      // @coverage-defer
      if (depth === 0) {
        segments.push({
          text: content.slice(segmentStart, i + 1),
          isOperator: false,
        });
        segmentStart = i + 1;
      }
    }
  }
  segments.push({ text: content.slice(segmentStart), isOperator: true });
  return segments;
}

/**
 * The resource name for a spot color, unique within the rule list, used to
 * select the separation colorspace in rewritten content streams.
 */
function spotColorResourceName(spotIndex: number): string {
  return `Spot${spotIndex}`;
}

// A tint operand/operator match must be delimited on both sides (so e.g.
// `10.776 g` can't match `0.776 g`). PDF tokens are delimited by whitespace or
// one of the delimiter characters.
const DELIMITER = String.raw`\s()<>[\]{}/%`;

/**
 * Rewrites tint fills/strokes (`<tint> g` / `<tint> G`) in a content stream to
 * spot colors. Returns the rewritten stream and the spot colors that matched.
 * Assumes a Ghostscript-converted grayscale PDF as input.
 */
function replaceTintOperatorsWithSpotColors(
  content: string,
  spotColors: readonly SpotColor[]
): { content: string; appliedSpotColors: readonly SpotColor[] } {
  const appliedSpotColorIndexes = new Set<number>();
  const updatedContent = splitContentStreamOnOperators(content)
    .map(({ text, isOperator }) => {
      if (!isOperator) return text;
      assert(!text.includes('%'), 'unexpected comment in content stream');
      assert(
        !new RegExp(`(^|[${DELIMITER}])BI[${DELIMITER}]`).test(text),
        'unexpected inline image in content stream'
      );
      let result = text;
      for (const [spotIndex, spot] of spotColors.entries()) {
        const tint = spot.grayscaleTint.replace(/\./g, '\\.');
        assert(
          !new RegExp(
            `(^|[${DELIMITER}])${tint}\\s+(sc|scn|SC|SCN|k|K|rg|RG)(?=[${DELIMITER}]|$)`
          ).test(result),
          `color tint ${spot.grayscaleTint} set via unsupported operator`
        );
        const name = spotColorResourceName(spotIndex);
        result = result.replace(
          new RegExp(
            `(^|[${DELIMITER}])${tint}\\s+(g|G)(?=[${DELIMITER}]|$)`,
            'g'
          ),
          (_, before: string, operator: string) => {
            appliedSpotColorIndexes.add(spotIndex);
            return `${before}${
              operator === 'g' ? `/${name} cs 1 scn` : `/${name} CS 1 SCN`
            }`;
          }
        );
      }
      return result;
    })
    .join('');
  return {
    content: updatedContent,
    appliedSpotColors: [...appliedSpotColorIndexes].map((i) => spotColors[i]),
  };
}

function decodeStream(stream: PDFRawStream): Uint8Array {
  // @coverage-defer
  return stream.dict.has(PDFName.of('Filter'))
    ? decodePDFRawStream(stream).decode()
    : stream.contents;
}

/**
 * A page's full content as a string (multiple content streams are equivalent
 * to their concatenation, which per the PDF spec may only split between
 * tokens).
 */
function pageContentString(context: PDFContext, pageNode: PDFDict): string {
  const contents = context.lookup(pageNode.get(PDFName.of('Contents')));
  // @coverage-defer
  if (contents === undefined) return '';
  const streams =
    // @coverage-defer
    contents instanceof PDFArray
      ? contents.asArray().map((ref) => context.lookup(ref))
      : [contents];
  return streams
    .map((stream) => {
      assert(stream instanceof PDFRawStream);
      return Buffer.from(decodeStream(stream)).toString('latin1');
    })
    .join('\n');
}

/**
 * Converts a color ballot PDF into a spot-color PDF for two-ink printing,
 * replacing the original file.
 *
 * First converts the PDF to grayscale, then identifies the given {@link
 * SpotColor}s in the PDF's content streams using their resulting grayscale
 * tints. Replaces each grayscale tint with a spot color separation, and adds
 * the separation to the page's resources. The resulting PDF is suitable for
 * printing with a black plate and a spot-color plate.
 *
 * Throws if the PDF contains more than one of the given spot colors, since in
 * our use case we only expect one spot color per ballot template.
 *
 * NOTE: Non-atomic - assumes usage with scratch files. Errors during conversion
 * may leave the file in an undefined state.
 */
export async function convertPdfToSpotColor(p: {
  pdfPath: string;
  spotColors: readonly SpotColor[];
}): Promise<void> {
  await ghostscriptGrayscaleFile(p.pdfPath);
  const grayscalePdf = await readFile(p.pdfPath);

  const doc = await PDFDocument.load(grayscalePdf, { updateMetadata: false });
  const { context } = doc;

  // One separation colorspace object per ink, created on first use.
  const separationRefs = new Map<number, PDFRef>();
  function separationRef(spotIndex: number): PDFRef {
    const cached = separationRefs.get(spotIndex);
    // @coverage-defer
    if (cached !== undefined) return cached;
    const spot = p.spotColors[spotIndex];
    const tintTransformRef = context.register(
      context.obj({
        FunctionType: 2,
        Domain: [0, 1],
        C0: [1, 1, 1],
        C1: hexToRgb(spot.sourceColor),
        N: 1,
        Range: [0, 1, 0, 1, 0, 1],
      })
    );
    const ref = context.register(
      context.obj([
        PDFName.of('Separation'),
        PDFName.of(spot.name),
        PDFName.of('DeviceRGB'),
        tintTransformRef,
      ])
    );
    separationRefs.set(spotIndex, ref);
    return ref;
  }

  const appliedSpotColorNames = new Set<string>();
  for (const page of doc.getPages()) {
    const original = pageContentString(context, page.node);
    const { content, appliedSpotColors } = replaceTintOperatorsWithSpotColors(
      original,
      p.spotColors
    );
    if (appliedSpotColors.length === 0) continue;

    // Delete the replaced content stream objects: pdf-lib serializes every
    // registered object on save, so they would otherwise remain in the file
    // as unreferenced bloat.
    const oldContentsValue = page.node.get(PDFName.of('Contents'));
    const oldContents = context.lookup(oldContentsValue);
    // @coverage-defer
    if (oldContents instanceof PDFArray) {
      for (const ref of oldContents.asArray()) {
        if (ref instanceof PDFRef) context.delete(ref);
      }
    }
    // @coverage-defer
    if (oldContentsValue instanceof PDFRef) context.delete(oldContentsValue);

    page.node.set(
      PDFName.of('Contents'),
      context.register(context.flateStream(content))
    );

    let resources = page.node.Resources();
    // @coverage-defer
    if (resources === undefined) {
      resources = context.obj({});
      page.node.set(PDFName.of('Resources'), resources);
    }
    let colorSpaces = resources.lookupMaybe(PDFName.of('ColorSpace'), PDFDict);
    // @coverage-defer
    if (colorSpaces === undefined) {
      colorSpaces = context.obj({});
      resources.set(PDFName.of('ColorSpace'), colorSpaces);
    }
    for (const spotColor of appliedSpotColors) {
      const spotIndex = p.spotColors.indexOf(spotColor);
      const name = PDFName.of(spotColorResourceName(spotIndex));
      const existing = colorSpaces.get(name);
      assert(
        // @coverage-defer
        existing === undefined || existing === separationRef(spotIndex),
        `page resources already define colorspace /${name.decodeText()}`
      );
      colorSpaces.set(name, separationRef(spotIndex));
      appliedSpotColorNames.add(spotColor.name);
    }
  }

  assert(
    appliedSpotColorNames.size <= 1,
    `expected at most one spot color per document, applied: ${[
      ...appliedSpotColorNames,
    ]
      .sort()
      .join(', ')}`
  );

  const saved = await doc.save({ useObjectStreams: false });
  const normalized = normalizePdf(Buffer.from(saved));
  await writeFile(p.pdfPath, normalized);
}
