import { PDFDocument, cmyk } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFile, writeFile } from 'fs/promises';
import { assert, assertDefined } from '@votingworks/basics';
import path from 'path';
import { Stdio, RealIo } from '.';

// eslint-disable-next-line vx/gts-jsdoc, @typescript-eslint/explicit-module-boundary-types
export function parseMetadataFromPdfFileName(pdfPath: string) {
  const [, townName, precinctName] =
    pdfPath.match(
      /^PRINT-precinct-ballot-(.+)-ballot-style-?(.*)-[a-f0-9]+\.pdf$/
    ) ?? [];
  return {
    townAndWard:
      townName === 'Rochester'
        ? assertDefined(precinctName).replaceAll('-', ' ')
        : assertDefined(townName).replace('-', ' '),
  };
}

/**
 * Adds the town, party, and ward name (if there is one) to the blank back page
 * of a ballot PDF to help identify
 */
export async function main(
  args: readonly string[],
  io: Stdio = RealIo
): Promise<number> {
  const [pdfPath, outputPath] = args;
  if (!(pdfPath && outputPath)) {
    io.stderr.write(
      'Usage: add-metadata-text-to-back-pages <ballot-path.pdf> <output-path.pdf>\n'
    );
    return 1;
  }

  const pdf = await PDFDocument.load(await readFile(pdfPath));
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(
    await readFile(`${__dirname}/helvetica-lt-std-bold-condensed.otf`)
  );
  assert(pdf.getPageCount() === 2, 'Expected a two-page PDF');
  const backPage = pdf.getPage(1);

  const metadata = parseMetadataFromPdfFileName(path.basename(pdfPath));
  const metadataText = [metadata.townAndWard]
    .map((s) => s.toLocaleUpperCase())
    .join(' • ');
  const fontSize = 11;
  const textWidth = font.widthOfTextAtSize(metadataText, fontSize);
  backPage.drawText(metadataText, {
    // Center horizontally
    x: (backPage.getWidth() - textWidth) / 2,
    y: 60,
    size: fontSize,
    font,
    color: cmyk(0, 0, 0, 1), // black
  });

  await writeFile(outputPath, await pdf.save());

  return 0;
}
