import React from 'react';
import ReactDomServer from 'react-dom/server';
import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import fs, { createReadStream, createWriteStream, readFileSync } from 'fs';
import PdfDocument from 'pdfkit';
import SvgToPdf from 'svg-to-pdfkit';
import { safeParseJson } from '@votingworks/types';
import {
  SvgPage,
  SvgRectangle,
  SvgTextBox,
  Document,
  AnyElement,
  Page,
  SvgImageProps,
  PPI,
  SvgBubble,
} from '@votingworks/hmpb-layout';
import { join } from 'path';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { tmpNameSync } from 'tmp';
import { finished } from 'stream/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const ASSETS_DIR = join(__dirname, '../assets');
// These font names need to be exactly of the pattern FontName[-Bold] in order
// for svg-to-pdfkit to find them (see https://github.com/alafr/SVG-to-PDFKit#fonts).
const FONTS = ['Roboto', 'Roboto-Bold'];

function removeSvgWidthAndHeight(svg: string): string {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  parsed.documentElement.removeAttribute('width');
  parsed.documentElement.removeAttribute('height');
  return new XMLSerializer().serializeToString(parsed);
}

// SVG-to-PDFKit doesn't support embedded SVGs, so we hack around it by
// inlining the SVG contents.
function InlineSvgImage({
  href,
  contents,
  ...props
}: SvgImageProps): JSX.Element {
  assert(
    contents !== undefined || href !== undefined,
    'Image must have href or contents'
  );
  const imageContents =
    contents ??
    readFileSync(join(ASSETS_DIR, assertDefined(href))).toString('utf8');
  // The image will only show up if we remove the width/height attributes.
  const image = removeSvgWidthAndHeight(imageContents);
  return <svg {...props} dangerouslySetInnerHTML={{ __html: image }} />;
}

function AnyElement(props: AnyElement): JSX.Element {
  switch (props.type) {
    case 'Rectangle': {
      const { children, ...rest } = props;
      return (
        <SvgRectangle {...rest}>
          {children?.map((child, index) => (
            <AnyElement key={index} {...child} />
          ))}
        </SvgRectangle>
      );
    }
    case 'Bubble':
      return <SvgBubble {...props} />;
    case 'TextBox':
      return <SvgTextBox {...props} />;
    case 'Image':
      return <InlineSvgImage {...props} />;
    default:
      throwIllegalValue(props);
  }
}

function renderPageToSvg(page: Page, width: number, height: number): string {
  const pageElement = (
    <SvgPage {...page} width={width} height={height} fontFamily="Roboto">
      {page.children.map((child, index) => (
        <AnyElement key={index} {...child} />
      ))}
    </SvgPage>
  );
  const pageSvgString = ReactDomServer.renderToStaticMarkup(pageElement);
  // In order to get the PDF to scale the SVG properly, we remove the
  // width/height attributes.
  // https://github.com/alafr/SVG-to-PDFKit/issues/125
  return removeSvgWidthAndHeight(pageSvgString);
}

/**
 * Convert document pixel dimensions to Postscript points (1/72 inch).
 */
function pixelsToPoints(pixels: number): number {
  return (pixels / PPI) * 72;
}

export function renderDocumentToPdf(document: Document): PDFKit.PDFDocument {
  const svgPages = document.pages.map((page) =>
    renderPageToSvg(page, document.width, document.height)
  );

  const pdf = new PdfDocument({
    layout: 'portrait',
    size: [pixelsToPoints(document.width), pixelsToPoints(document.height)],
    autoFirstPage: false,
  });
  for (const font of FONTS) {
    pdf.registerFont(font, join(ASSETS_DIR, `fonts/${font}.ttf`));
  }

  for (const svgPage of svgPages) {
    pdf.addPage();
    SvgToPdf(pdf, svgPage, 0, 0);
  }

  return pdf;
}

/**
 * Given a PDFKit document, convert it to grayscale and return a read stream to
 * the resulting PDF. Consumes the input PDF.
 */

export async function convertPdfToGrayscale(
  pdf: PDFKit.PDFDocument
): Promise<fs.ReadStream> {
  const tmpPdfFilePath = tmpNameSync();
  const fileStream = createWriteStream(tmpPdfFilePath);
  pdf.pipe(fileStream);
  pdf.end();
  await finished(fileStream);
  const tmpGrayscalePdfFilePath = tmpNameSync();
  await promisify(exec)(`
    gs \
      -sOutputFile=${tmpGrayscalePdfFilePath} \
      -sDEVICE=pdfwrite \
      -sColorConversionStrategy=Gray \
      -dProcessColorModel=/DeviceGray \
      -dNOPAUSE \
      -dBATCH \
      ${tmpPdfFilePath}
  `);
  return createReadStream(tmpGrayscalePdfFilePath);
}

/* istanbul ignore next */
export function main(): void {
  const USAGE = `Usage: ./bin/render-ballot <ballot-document.json> <ballot-output.pdf>`;
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    // eslint-disable-next-line no-console
    console.error(USAGE);
    process.exit(1);
  }

  const [ballotDocumentJsonPath, outputPdfPath] = args;
  const ballotDocumentJson = fs.readFileSync(ballotDocumentJsonPath, 'utf8');
  const ballotDocument = safeParseJson(ballotDocumentJson).assertOk(
    'Invalid ballot document JSON'
  );
  const startTime = process.hrtime.bigint();
  const pdf = renderDocumentToPdf(ballotDocument as Document);
  pdf.pipe(fs.createWriteStream(outputPdfPath));
  pdf.end();
  const endTime = process.hrtime.bigint();
  // eslint-disable-next-line no-console
  console.log(`Rendered ballot in ${(endTime - startTime) / BigInt(1e6)}ms`);
}
