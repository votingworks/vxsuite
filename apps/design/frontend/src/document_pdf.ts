import { throwIllegalValue } from '@votingworks/basics';
// import PdfDocument from 'pdfkit';
import {
  AnyElement,
  Document,
  Page,
  Rectangle,
  Ellipse,
  Box,
} from './document_types';

// if (!('PDFDocument' in globalThis)) {
//   import PdfDocument from 'pdfkit';
// }

// type Pdf = typeof PdfDocument;
type Pdf = any;

function renderRectangleToPdf(pdf: Pdf, rectangle: Rectangle) {
  pdf
    .roundedRect(
      rectangle.x,
      rectangle.y,
      rectangle.width,
      rectangle.height,
      rectangle.borderRadius ?? 0
    )
    .lineWidth(rectangle.strokeWidth ?? 0)
    .fillOpacity(rectangle.fill === 'none' ? 0 : 1)
    .fillAndStroke(rectangle.fill, rectangle.stroke);
}

function renderEllipseToPdf(pdf: Pdf, ellipse: Ellipse) {
  pdf
    .ellipse(
      ellipse.x + ellipse.width / 2,
      ellipse.y + ellipse.height / 2,
      ellipse.width / 2,
      ellipse.height / 2
    )
    .lineWidth(ellipse.strokeWidth ?? 0)
    .fillAndStroke(ellipse.fill, ellipse.stroke);
}

function renderBoxToPdf(pdf: Pdf, box: Box) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { type, children, ...rectangle } = box;
  renderRectangleToPdf(pdf, { type: 'Rectangle', ...rectangle });
  for (const element of children ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    renderAnyElementToPdf(pdf, element);
  }
}

function renderAnyElementToPdf(pdf: Pdf, element: AnyElement) {
  switch (element.type) {
    case 'Rectangle':
      return renderRectangleToPdf(pdf, element);
    case 'Ellipse':
      return renderEllipseToPdf(pdf, element);
    case 'Box':
      return renderBoxToPdf(pdf, element);
    default:
      throwIllegalValue(element);
  }
}

function renderPageToPdf(pdf: Pdf, page: Page) {
  pdf.addPage();
  for (const element of page.children) {
    renderAnyElementToPdf(pdf, element);
  }
}

export function renderDocumentToPdf(
  document: Document,
  outStream: NodeJS.WritableStream
): void {
  // @ts-ignore
  const pdf = new globalThis.PDFDocument({
    layout: 'portrait',
    size: 'letter',
    autoFirstPage: false,
  });
  for (const page of document.pages) {
    renderPageToPdf(pdf, page);
  }

  pdf.pipe(outStream);
  pdf.end();
}
