/* eslint-disable react/no-array-index-key -- static rendering, order never changes */
import React from 'react';
import ReactDomServer from 'react-dom/server';
import { throwIllegalValue } from '@votingworks/basics';
import fs from 'fs';
import PdfDocument from 'pdfkit';
import SvgToPdf from 'svg-to-pdfkit';
import { safeParseJson } from '@votingworks/types';
import { SvgBox, SvgEllipse, SvgPage, SvgRectangle } from './document_svg';
import { Document, AnyElement, Page } from './document_types';

function SvgAnyElement(props: AnyElement): JSX.Element {
  // eslint-disable-next-line react/destructuring-assignment
  switch (props.type) {
    case 'Rectangle':
      return <SvgRectangle {...props} />;
    case 'Ellipse':
      return <SvgEllipse {...props} />;
    case 'Box': {
      const { children, ...rest } = props;
      return (
        <SvgBox {...rest}>
          {children?.map((child, index) => (
            <SvgAnyElement key={index} {...child} />
          ))}
        </SvgBox>
      );
    }
    default:
      throwIllegalValue(props);
  }
}

function renderPageToSvg(page: Page, width: number, height: number): string {
  const pageElement = (
    <SvgPage {...page} width={width} height={height}>
      {page.children.map((child, index) => (
        <SvgAnyElement key={index} {...child} />
      ))}
    </SvgPage>
  );
  const pageSvgString = ReactDomServer.renderToStaticMarkup(pageElement);
  // In order to get the PDF to scale the SVG properly, we have to remove the
  // width/height attributes.
  // https://github.com/alafr/SVG-to-PDFKit/issues/125
  return pageSvgString.replace(/^<svg width="\d*" height="\d*"/, '<svg');
}

export function renderDocumentToPdf(
  document: Document,
  outStream: NodeJS.WritableStream
): void {
  const svgPages = document.pages.map((page) =>
    renderPageToSvg(page, document.width, document.height)
  );

  const pdf = new PdfDocument({
    layout: 'portrait',
    size: 'letter',
    autoFirstPage: false,
  });

  for (const svgPage of svgPages) {
    pdf.addPage();
    SvgToPdf(pdf, svgPage, 0, 0);
  }

  pdf.pipe(outStream);
  pdf.end();
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
  renderDocumentToPdf(
    ballotDocument as Document,
    fs.createWriteStream(outputPdfPath)
  );
}
