import { Document, Page, pdfjs } from 'react-pdf';
import styled from 'styled-components';
import React, { useMemo, useState } from 'react';
import { Icons } from '@votingworks/ui';
import { Buffer } from 'buffer';
import { range } from '@votingworks/basics';

// Worker file must be copied from pdfjs-dist into public directory
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

const PdfContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: ${(p) => p.theme.colors.container};
  max-height: 100%;
`;

const PdfDocumentScroller = styled.div`
  overflow-y: auto;
  flex: 1;
  padding: 1rem 0;
  width: 100%;
  /* stylelint-disable selector-class-pattern */
  .react-pdf__Document .react-pdf__Page {
    box-shadow: 0 0 0.5rem rgb(0, 0, 0, 25%);
    margin: 0 auto;
    width: min-content;

    &:not(:last-child) {
      margin-bottom: 1rem;
    }
  }
`;

const PdfControls = styled.div`
  position: sticky;
  left: 0;
  top: 0;
  z-index: 1;
  width: 100%;
  padding: 0.4rem 1rem;
  min-height: 1.6rem;
  background-color: ${(p) => p.theme.colors.inverseContainer};
  color: ${(p) => p.theme.colors.onInverse};
  display: flex;
  align-items: center;
  font-size: 0.8rem;
`;

export const Row = styled.div`
  display: flex;
  flex-direction: row;
`;

const DEFAULT_ZOOM = 1.8;

export function PdfViewer({
  pdfData,
  disabled,
}: {
  pdfData?: Buffer;
  disabled?: boolean;
}): JSX.Element {
  const [numPages, setNumPages] = useState<number>();
  const [currentPage, setCurrentPage] = useState(1);
  const file = useMemo(
    // must copy the buffer before passing to react-pdf, otherwise it will be consumed
    // bug: https://github.com/wojtekmaj/react-pdf/issues/1657
    () => (pdfData ? { data: Buffer.from(pdfData) } : undefined),
    [pdfData]
  );

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    if (!numPages) return;
    const { scrollHeight, scrollTop } = e.currentTarget;
    // Add a fraction of the page height to the scroll position to make the
    // transition happen a little earlier (when most of the next page is
    // visible)
    const pageHeight = scrollHeight / numPages;
    const scrollProgress = (scrollTop + pageHeight / 6) / scrollHeight;
    setCurrentPage(Math.floor(scrollProgress * numPages) + 1);
  }
  const loading = (
    <Row
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: '3rem',
        height: '100%',
        minHeight: '5rem',
      }}
      data-testid="pdf-loading"
    >
      <Icons.Loading />
    </Row>
  );

  return (
    <PdfContainer>
      <PdfControls>
        <span>{numPages ? `Page: ${currentPage}/${numPages}` : ''}</span>
      </PdfControls>
      {file ? (
        <PdfDocumentScroller onScroll={onScroll} data-testid="pdf-scroller">
          {!numPages && loading}
          <Document
            file={file}
            onSourceSuccess={() => setNumPages(undefined)}
            onLoadSuccess={(result) => setNumPages(result.numPages)}
            // Hide the built in loading message
            loading=""
            data-testid="pdf-document"
          >
            {numPages &&
              range(1, numPages + 1).map((pageNumber) => (
                <Page
                  key={pageNumber}
                  // ReactPDF renders at 3/4 of actual size for some reason
                  // https://github.com/wojtekmaj/react-pdf/issues/1219
                  scale={DEFAULT_ZOOM * (4 / 3)}
                  // SVG render mode is deprecated, but for some reason the PDF
                  // fonts are grainy in kiosk-browser. Because that's not the
                  // case in Chrome, hopefully it's a Chrome version issue and
                  // we can move to the "canvas" default and avoid the console
                  // warnings
                  renderMode="svg"
                  pageNumber={pageNumber}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading=""
                  data-testid={`pdf-page-${pageNumber}`}
                />
              ))}
          </Document>
        </PdfDocumentScroller>
      ) : !disabled ? (
        loading
      ) : null}
    </PdfContainer>
  );
}
