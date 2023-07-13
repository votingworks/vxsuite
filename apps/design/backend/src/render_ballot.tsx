import ReactDomServer from 'react-dom/server';
import { throwIllegalValue } from '@votingworks/basics';
import fs, { readFileSync } from 'fs';
import PdfDocument from 'pdfkit';
import SvgToPdf from 'svg-to-pdfkit';
import { BallotPaperSize, safeParseJson } from '@votingworks/types';
import {
  SvgPage,
  SvgRectangle,
  SvgTextBox,
  Document,
  AnyElement,
  Page,
  SvgImageProps,
  PPI,
  dimensionsForPaper,
} from '@votingworks/design-shared';
import { join } from 'path';

const ASSETS_DIR = join(__dirname, '../assets');
// These font names need to be exactly of the pattern FontName[-Bold] in order
// for svg-to-pdfkit to find them (see https://github.com/alafr/SVG-to-PDFKit#fonts).
// We set fontFamily = HelveticaNeue in the SvgPage component in document_svg.tsx.
const FONTS = ['HelveticaNeue', 'HelveticaNeue-Bold'];

// SVG-to-PDFKit doesn't support embedded SVGs, so we hack around it by
// inlining the SVG contents.
function InlineSvgImage(props: SvgImageProps): JSX.Element {
  const imageContents = readFileSync(join(ASSETS_DIR, props.href)).toString(
    'utf8'
  );
  return <svg {...props} dangerouslySetInnerHTML={{ __html: imageContents }} />;
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
    <SvgPage {...page} width={width} height={height}>
      {page.children.map((child, index) => (
        <AnyElement key={index} {...child} />
      ))}
    </SvgPage>
  );
  const pageSvgString = ReactDomServer.renderToStaticMarkup(pageElement);
  // In order to get the PDF to scale the SVG properly, we have to remove the
  // width/height attributes.
  // https://github.com/alafr/SVG-to-PDFKit/issues/125
  return pageSvgString.replace(/^<svg width="\d*" height="\d*"/, '<svg');
}

function paperSizeForDocument(document: Document) {
  const size = [BallotPaperSize.Letter, BallotPaperSize.Legal].find(
    (paperSize) => {
      const dimensions = dimensionsForPaper(paperSize);
      return (
        dimensions.width * PPI === document.width &&
        dimensions.height * PPI === document.height
      );
    }
  );
  if (!size) {
    throw new Error(
      `Unsupported ballot dimensions ${document.width}x${document.height}`
    );
  }
  return size;
}

export function renderDocumentToPdf(document: Document): PDFKit.PDFDocument {
  const svgPages = document.pages.map((page) =>
    renderPageToSvg(page, document.width, document.height)
  );

  const pdf = new PdfDocument({
    layout: 'portrait',
    size: paperSizeForDocument(document),
    autoFirstPage: false,
  });
  for (const font of FONTS) {
    pdf.registerFont(font, join(ASSETS_DIR, `fonts/${font}.woff`));
  }

  for (const svgPage of svgPages) {
    pdf.addPage();
    SvgToPdf(pdf, svgPage, 0, 0);
  }

  return pdf;
}

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
